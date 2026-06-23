import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';
import { ActivationDashboardService } from './activation-dashboard.service';

@ApiTags('Onboarding Analytics')
@Controller('api/super-admin/onboarding-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class OnboardingAnalyticsAdminController {
  constructor(
    private readonly service: OnboardingAnalyticsService,
    private readonly activationDashboard: ActivationDashboardService,
  ) {}

  @Get('funnel')
  @ApiOperation({ summary: 'Get onboarding funnel aggregated by event' })
  async getFunnel(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
    return this.service.getFunnel(safeDays);
  }

  @Get('retention')
  @ApiOperation({
    summary: 'Cohortes de retención D1/D7 por día de primer evento',
  })
  async getRetention(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 30;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 30;
    return this.service.getRetentionCohorts(safeDays);
  }

  @Get('activation-dashboard')
  @ApiOperation({
    summary: 'Tablero semanal de activación (registro → cobro → equipo)',
  })
  async getActivationDashboard(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
    return this.activationDashboard.getDashboard(safeDays);
  }

  @Get('attribution')
  @ApiOperation({
    summary: 'Desglose de campañas UTM (landings → registros → publicados)',
  })
  async getAttribution(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 30;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 30;
    return this.service.getAttributionBreakdown(safeDays);
  }
}
