import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';

@ApiTags('Onboarding Analytics')
@Controller('api/super-admin/onboarding-analytics')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@ApiBearerAuth()
export class OnboardingAnalyticsAdminController {
  constructor(private readonly service: OnboardingAnalyticsService) {}

  @Get('funnel')
  @ApiOperation({ summary: 'Get onboarding funnel aggregated by event' })
  async getFunnel(@Query('days') days?: string) {
    const parsed = days ? Number(days) : 7;
    const safeDays =
      Number.isFinite(parsed) && parsed > 0 && parsed <= 90 ? parsed : 7;
    return this.service.getFunnel(safeDays);
  }
}
