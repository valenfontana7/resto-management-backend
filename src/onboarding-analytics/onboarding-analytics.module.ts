import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';
import { OnboardingAnalyticsPublicController } from './onboarding-analytics-public.controller';
import { OnboardingAnalyticsAdminController } from './onboarding-analytics-admin.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    OnboardingAnalyticsPublicController,
    OnboardingAnalyticsAdminController,
  ],
  providers: [OnboardingAnalyticsService],
  exports: [OnboardingAnalyticsService],
})
export class OnboardingAnalyticsModule {}
