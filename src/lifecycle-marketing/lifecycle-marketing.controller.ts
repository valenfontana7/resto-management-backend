import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { LifecycleMarketingService } from './services/lifecycle-marketing.service';
import { OutcomeCollector } from './services/outcome-collector.service';
import { LifecycleDeliveryProcessorService } from './services/lifecycle-delivery-processor.service';
import {
  MarketingDirectorService,
  WELCOME_TEMPLATE_ID,
  WINBACK_CAMPAIGN_ID,
} from './services/marketing-director.service';
import { TemplateOverrideService } from './services/template-override.service';
import { CampaignOverrideService } from './services/campaign-override.service';
import { listCampaigns } from './catalog/campaign-catalog.loader';
import { listTemplates } from './catalog/template-catalog.loader';
import { RegisterLifecycleOutcomeDto } from './dto/register-lifecycle-outcome.dto';
import { UpdateLifecycleTemplateDto } from './dto/update-lifecycle-template.dto';
import { SetLifecycleCampaignPausedDto } from './dto/set-lifecycle-campaign-paused.dto';
import type { LifecycleOutcomeRegistrationInput } from './services/outcome-collector.service';

@ApiTags('Lifecycle Marketing')
@Controller('api/super-admin/lifecycle-marketing')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class LifecycleMarketingController {
  constructor(
    private readonly engine: LifecycleMarketingService,
    private readonly outcomes: OutcomeCollector,
    private readonly deliveryProcessor: LifecycleDeliveryProcessorService,
    private readonly marketingDirector: MarketingDirectorService,
    private readonly templateOverrides: TemplateOverrideService,
    private readonly campaignOverrides: CampaignOverrideService,
  ) {}

  @Get('director/command-center')
  @ApiOperation({ summary: 'Vista command center — director de marketing' })
  getCommandCenter() {
    return this.marketingDirector.getCommandCenter();
  }

  @Get('director/campaigns/running')
  @ApiOperation({ summary: 'Campañas en ejecución con métricas' })
  getRunningCampaigns() {
    const since = new Date();
    since.setDate(since.getDate() - 7);
    return this.marketingDirector.getRunningCampaignsSummary(since);
  }

  @Get('director/emails/today')
  @ApiOperation({ summary: 'Emails enviados hoy' })
  async getEmailsToday() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return { emails: await this.marketingDirector.listEmailsToday(start) };
  }

  @Get('director/campaigns/:campaignId/performance')
  @ApiOperation({ summary: 'Performance de una campaña (ej. winback)' })
  getCampaignPerformance(
    @Param('campaignId') campaignId: string,
    @Query('days') days?: string,
  ) {
    const parsed = days ? Number(days) : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
    return this.marketingDirector.getCampaignPerformance(campaignId, safeDays);
  }

  @Get('director/campaigns/winback/performance')
  @ApiOperation({ summary: 'Atajo — performance campaña winback' })
  getWinbackPerformance(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
    return this.marketingDirector.getCampaignPerformance(
      WINBACK_CAMPAIGN_ID,
      safeDays,
    );
  }

  @Patch('director/campaigns/:campaignId/paused')
  @ApiOperation({ summary: 'Pausar o reactivar una campaña del catálogo' })
  setCampaignPaused(
    @Param('campaignId') campaignId: string,
    @Body() body: SetLifecycleCampaignPausedDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    return this.campaignOverrides.setPaused(
      campaignId,
      body.paused,
      req.user?.email ?? req.user?.id ?? 'super-admin',
    );
  }

  @Get('director/templates/welcome')
  @ApiOperation({ summary: 'Plantilla de bienvenida (catálogo + override)' })
  getWelcomeTemplate() {
    return this.templateOverrides.getEffectiveTemplate(WELCOME_TEMPLATE_ID);
  }

  @Patch('director/templates/welcome')
  @ApiOperation({ summary: 'Editar email de bienvenida' })
  updateWelcomeTemplate(
    @Body() body: UpdateLifecycleTemplateDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    return this.templateOverrides.upsertOverride(WELCOME_TEMPLATE_ID, {
      ...body,
      updatedBy: req.user?.email ?? req.user?.id ?? 'super-admin',
    });
  }

  @Get('director/templates/:templateId')
  @ApiOperation({ summary: 'Plantilla efectiva por ID' })
  getTemplate(@Param('templateId') templateId: string) {
    return this.templateOverrides.getEffectiveTemplate(templateId);
  }

  @Patch('director/templates/:templateId')
  @ApiOperation({ summary: 'Actualizar override de plantilla' })
  updateTemplate(
    @Param('templateId') templateId: string,
    @Body() body: UpdateLifecycleTemplateDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    return this.templateOverrides.upsertOverride(templateId, {
      ...body,
      updatedBy: req.user?.email ?? req.user?.id ?? 'super-admin',
    });
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'KPIs del Lifecycle Marketing Engine' })
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

  @Get('catalog/campaigns')
  @ApiOperation({ summary: 'Catálogo de campañas LCM' })
  listCampaignsCatalog() {
    return { campaigns: listCampaigns() };
  }

  @Get('catalog/templates')
  @ApiOperation({ summary: 'Catálogo de plantillas LCM' })
  listTemplatesCatalog() {
    return { templates: listTemplates() };
  }

  @Get('calendar')
  @ApiOperation({ summary: 'Calendario de comunicaciones programadas' })
  listCalendar(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 14;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 14;
    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + safeDays);
    return this.engine.listCalendar(from, to);
  }

  @Get('ab-tests')
  @ApiOperation({ summary: 'Estructura A/B tests (sin implementación)' })
  listAbTestsStructure() {
    return {
      enabled: false,
      note: 'Estructura reservada — variantes se definirán en catálogo v2',
      variants: [],
    };
  }

  @Get('plan/:restaurantId')
  @ApiOperation({ summary: 'Preview plan de campañas (dry-run)' })
  previewPlan(
    @Param('restaurantId') restaurantId: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.engine.planForRestaurant(restaurantId, {
      dryRun: true,
      refreshIntelligence: refresh === 'true',
    });
  }

  @Post('process/:restaurantId')
  @ApiOperation({ summary: 'Ejecutar pipeline + persistir + enviar si due' })
  process(
    @Param('restaurantId') restaurantId: string,
    @Query('refresh') refresh?: string,
  ) {
    return this.engine.planForRestaurant(restaurantId, {
      dryRun: false,
      refreshIntelligence: refresh === 'true',
    });
  }

  @Post('process-due')
  @ApiOperation({ summary: 'Ejecuta entregas SCHEDULED vencidas' })
  processDue(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 50;
    return this.deliveryProcessor.processDueDeliveries(
      Number.isFinite(parsed) ? parsed : 50,
    );
  }

  @Get('deliveries/:restaurantId')
  @ApiOperation({ summary: 'Historial de entregas del restaurante' })
  async listDeliveries(@Param('restaurantId') restaurantId: string) {
    return { deliveries: await this.engine.listDeliveries(restaurantId) };
  }

  @Get('campaigns/active/:restaurantId')
  @ApiOperation({ summary: 'Campañas activas del restaurante' })
  async listActive(@Param('restaurantId') restaurantId: string) {
    return {
      campaignTypes: await this.engine.listActiveCampaigns(restaurantId),
    };
  }

  @Get('outcomes/:restaurantId')
  @ApiOperation({ summary: 'Outcomes del restaurante' })
  async listOutcomes(@Param('restaurantId') restaurantId: string) {
    return { outcomes: await this.engine.listOutcomes(restaurantId) };
  }

  @Post('outcomes')
  @ApiOperation({ summary: 'Registrar outcome (webhook / manual)' })
  registerOutcome(@Body() body: RegisterLifecycleOutcomeDto) {
    return this.outcomes.register(body as LifecycleOutcomeRegistrationInput);
  }
}
