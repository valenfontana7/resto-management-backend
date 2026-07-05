import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { EngagementEngineService } from './services/engagement-engine.service';
import { OutcomeTracker } from './services/outcome-tracker.service';
import { EngagementDeliveryProcessorService } from './services/engagement-delivery-processor.service';
import { listJourneys } from './catalog/journey-catalog.loader';
import { listTemplates } from './catalog/template-catalog.loader';
import type { OutcomeRegistrationInput } from './types/outcome.types';

@ApiTags('Customer Engagement')
@Controller('api/super-admin/customer-engagement')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class CustomerEngagementController {
  constructor(
    private readonly engine: EngagementEngineService,
    private readonly outcomeTracker: OutcomeTracker,
    private readonly deliveryProcessor: EngagementDeliveryProcessorService,
  ) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs agregados del motor CS (R2)' })
  getDashboard(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
    return this.engine.getDashboardStats(safeDays);
  }

  @Get('deliveries/recent')
  @ApiOperation({ summary: 'Últimas entregas cross-restaurant' })
  listRecentGlobal(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 30;
    return this.engine.listRecentDeliveriesGlobal(
      Number.isFinite(parsed) ? Math.min(parsed, 100) : 30,
    );
  }

  @Get('policies')
  @ApiOperation({
    summary: 'List engagement policies (derived from REC codes)',
  })
  listPolicies() {
    return { policies: this.engine.listPolicies() };
  }

  @Get('catalog/journeys')
  @ApiOperation({ summary: 'Journey catalog metadata' })
  listJourneysCatalog() {
    return { journeys: listJourneys() };
  }

  @Get('catalog/templates')
  @ApiOperation({ summary: 'Template catalog' })
  listTemplatesCatalog() {
    return { templates: listTemplates() };
  }

  @Get('plan/:restaurantId')
  @ApiOperation({ summary: 'Preview engagement plan (dry-run)' })
  async previewPlan(
    @Param('restaurantId') restaurantId: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.engine.planForRestaurant(restaurantId, {
      dryRun: true,
      refreshIntelligence: refresh === 'true',
    });
  }

  @Post('process/:restaurantId')
  @ApiOperation({ summary: 'Run pipeline + persist + send email when due' })
  async process(
    @Param('restaurantId') restaurantId: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.engine.planForRestaurant(restaurantId, {
      dryRun: false,
      refreshIntelligence: refresh === 'true',
    });
  }

  @Post('process-due')
  @ApiOperation({ summary: 'Ejecuta entregas SCHEDULED con deliverAt vencido' })
  processDue(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 50;
    return this.deliveryProcessor.processDueDeliveries(
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Get('deliveries/:restaurantId')
  @ApiOperation({ summary: 'Entregas del restaurante' })
  async listDeliveries(@Param('restaurantId') restaurantId: string) {
    return { deliveries: await this.engine.listDeliveries(restaurantId) };
  }

  @Get('journeys/:restaurantId')
  @ApiOperation({ summary: 'Journeys activos del restaurante' })
  async listActiveJourneys(@Param('restaurantId') restaurantId: string) {
    return { journeys: await this.engine.listActiveJourneys(restaurantId) };
  }

  @Get('outcomes/:restaurantId')
  @ApiOperation({ summary: 'Outcomes del restaurante' })
  async listOutcomes(@Param('restaurantId') restaurantId: string) {
    return { outcomes: await this.engine.listOutcomes(restaurantId) };
  }

  @Post('outcomes')
  @ApiOperation({ summary: 'Registrar outcome (webhook / manual)' })
  registerOutcome(@Body() body: OutcomeRegistrationInput) {
    return this.outcomeTracker.register(body);
  }
}
