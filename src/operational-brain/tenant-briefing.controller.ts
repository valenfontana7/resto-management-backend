import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  RestaurantIdParam,
  RestaurantOwnerGuard,
} from '../common/guards/restaurant-owner.guard';
import { DecisionEngineOrchestratorService } from '../decision-engine/decision-engine-orchestrator.service';
import { ResolutionMemoryService } from '../operations/services/resolution-memory.service';
import { EpisodeLoggingService } from '../operations/services/episode-logging.service';

@ApiTags('operational-brain')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RestaurantOwnerGuard)
@RestaurantIdParam('restaurantId')
@Controller('api/restaurants/:restaurantId/intelligence')
export class TenantBriefingController {
  constructor(
    private readonly orchestrator: DecisionEngineOrchestratorService,
    private readonly resolutionMemory: ResolutionMemoryService,
    private readonly episodes: EpisodeLoggingService,
  ) {}

  @Get('briefing')
  @ApiOperation({
    summary: 'Briefing del dueño (server-side, reemplaza cognición browser)',
  })
  async getBriefing(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    let bundle = await this.orchestrator.getSnapshot(restaurantId);
    if (!bundle) {
      bundle = await this.orchestrator.evaluateRestaurant(restaurantId);
    }
    if (!bundle) {
      throw new NotFoundException('Sin briefing disponible');
    }

    const topRecommendations = (bundle.recommendations ?? []).slice(0, 5);
    const topOpportunities = (bundle.opportunities ?? []).slice(0, 5);

    const [patterns, recurringPendings, recentEpisodes] = await Promise.all([
      this.resolutionMemory.getActivePatterns(restaurantId, 3),
      this.resolutionMemory.getRecurringPendings(restaurantId, 5),
      this.episodes.listRecent(restaurantId, user.userId, 5),
    ]);

    return {
      generatedAt: bundle.computedAt,
      restaurantId,
      rssScore: bundle.snapshot?.rss?.value ?? null,
      rssBand: bundle.snapshot?.rss?.band ?? null,
      dimensions: bundle.snapshot?.dimensions ?? [],
      recommendations: topRecommendations,
      opportunities: topOpportunities,
      patterns,
      recurringPendings,
      recentEpisodes,
      explanation: bundle.explanation ?? null,
      source: 'server',
    };
  }
}
