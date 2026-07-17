import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MarketingHubService } from './services/marketing-hub.service';
import type { MarketingDeliveriesQuery } from './services/marketing-deliveries-query.service';
import { SetLifecycleCampaignPausedDto } from '../lifecycle-marketing/dto/set-lifecycle-campaign-paused.dto';

function parseDays(days?: string) {
  const parsed = days ? Number(days) : 7;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
}

@ApiTags('Marketing Hub')
@Controller('api/super-admin/marketing-hub')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class MarketingHubController {
  constructor(private readonly hub: MarketingHubService) {}

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard agregado del Marketing Hub' })
  getDashboard(@Query('days') days?: string) {
    return this.hub.getDashboard(parseDays(days));
  }

  @Get('care-queue')
  @ApiOperation({
    summary: 'Cuentas a cuidar hoy (riesgo + activación + winback)',
  })
  getCareQueue(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : 12;
    return this.hub.getCareQueue(
      Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 30) : 12,
    );
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Listado completo de campañas con métricas' })
  getCampaigns(@Query('days') days?: string) {
    return this.hub.getCampaigns(parseDays(days));
  }

  @Patch('campaigns/:campaignId/paused')
  @ApiOperation({ summary: 'Pausar o reactivar una campaña' })
  setCampaignPaused(
    @Param('campaignId') campaignId: string,
    @Body() body: SetLifecycleCampaignPausedDto,
    @Req() req: { user?: { id?: string; email?: string } },
  ) {
    return this.hub.setCampaignPaused(
      campaignId,
      body.paused,
      req.user?.email ?? req.user?.id ?? 'super-admin',
    );
  }

  @Get('campaigns/:campaignId/performance')
  @ApiOperation({ summary: 'Analytics de una campaña' })
  getCampaignPerformance(
    @Param('campaignId') campaignId: string,
    @Query('days') days?: string,
  ) {
    return this.hub.getCampaignPerformance(campaignId, parseDays(days));
  }

  @Get('templates')
  @ApiOperation({ summary: 'Biblioteca de plantillas LCM + CE' })
  getTemplates() {
    return this.hub.getTemplates();
  }

  @Get('templates/:templateId')
  @ApiOperation({ summary: 'Detalle de plantilla' })
  async getTemplate(@Param('templateId') templateId: string) {
    const template = await this.hub.getTemplate(templateId);
    if (!template) {
      throw new NotFoundException(`Plantilla ${templateId} no encontrada`);
    }
    return template;
  }

  @Get('journeys')
  @ApiOperation({ summary: 'Journeys y flujo canónico de onboarding' })
  getJourneys(@Query('days') days?: string) {
    return this.hub.getJourneys(parseDays(days));
  }

  @Get('deliveries')
  @ApiOperation({ summary: 'Historial unificado de comunicaciones' })
  getDeliveries(
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('source') source?: MarketingDeliveriesQuery['source'],
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('campaignId') campaignId?: string,
    @Query('templateId') templateId?: string,
    @Query('restaurantId') restaurantId?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Number(limit) : undefined;
    const parsedOffset = offset ? Number(offset) : undefined;
    const parsedDays = days ? Number(days) : undefined;

    return this.hub.getDeliveries({
      days: parsedDays,
      from,
      to,
      source,
      status,
      channel,
      campaignId,
      templateId,
      restaurantId,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      offset: Number.isFinite(parsedOffset) ? parsedOffset : undefined,
    });
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Panel analítico agregado' })
  getAnalytics(@Query('days') days?: string) {
    return this.hub.getAnalytics(parseDays(days));
  }

  @Get('restaurants/:ref')
  @ApiOperation({ summary: 'Vista 360° de comunicaciones por restaurante' })
  async getRestaurantView(@Param('ref') ref: string) {
    const view = await this.hub.getRestaurantView(ref);
    if (!view) {
      throw new NotFoundException(`Restaurante ${ref} no encontrado`);
    }
    return view;
  }
}
