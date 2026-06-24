import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';
import { ActivationDashboardService } from './activation-dashboard.service';
import { OnboardingAnalyticsPublicController } from './onboarding-analytics-public.controller';
import { OnboardingAnalyticsAdminController } from './onboarding-analytics-admin.controller';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [
    OnboardingAnalyticsPublicController,
    OnboardingAnalyticsAdminController,
  ],
  providers: [OnboardingAnalyticsService, ActivationDashboardService],
  exports: [OnboardingAnalyticsService, ActivationDashboardService],
})
export class OnboardingAnalyticsModule {}
