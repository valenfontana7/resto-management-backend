import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingAiController } from './onboarding-ai.controller';
import { OnboardingAiService } from './onboarding-ai.service';
import { OnboardingDraftController } from './onboarding-draft.controller';
import { OnboardingDraftService } from './onboarding-draft.service';

@Module({
  imports: [AuthModule, CommonModule, PrismaModule],
  controllers: [OnboardingAiController, OnboardingDraftController],
  providers: [OnboardingAiService, OnboardingDraftService],
  exports: [OnboardingAiService, OnboardingDraftService],
})
export class OnboardingAiModule {}
