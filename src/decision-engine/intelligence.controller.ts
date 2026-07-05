import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DecisionEngineOrchestratorService } from './decision-engine-orchestrator.service';
import { RESTAURANT_INTELLIGENCE_BUNDLE_VERSION } from './types/restaurant-intelligence-bundle.v1';

class BatchSnapshotsDto {
  restaurantIds!: string[];
}

@ApiTags('Intelligence')
@Controller('api/super-admin/intelligence')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class IntelligenceController {
  constructor(
    private readonly orchestrator: DecisionEngineOrchestratorService,
  ) {}

  @Get('snapshot/:restaurantId')
  async getSnapshot(@Param('restaurantId') restaurantId: string) {
    const bundle = await this.orchestrator.getSnapshot(restaurantId);
    if (!bundle) {
      throw new NotFoundException(
        `Sin snapshot de inteligencia para ${restaurantId}. Pendiente evaluación.`,
      );
    }
    return bundle;
  }

  @Post('snapshots')
  async getSnapshotsBatch(@Body() body: BatchSnapshotsDto) {
    const lifecycleMap = new Map(
      (body.restaurantIds ?? []).map((id) => [id, 'CLIENT' as const]),
    );
    const bundles = await this.orchestrator.getSnapshotsBatch(
      body.restaurantIds ?? [],
      lifecycleMap,
    );
    return {
      contractVersion: RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
      snapshots: Object.fromEntries(bundles),
    };
  }

  @Post('evaluate/:restaurantId')
  async evaluate(@Param('restaurantId') restaurantId: string) {
    return this.orchestrator.evaluateRestaurant(restaurantId);
  }
}
