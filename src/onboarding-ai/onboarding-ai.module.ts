import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { OnboardingAiController } from './onboarding-ai.controller';
import { OnboardingAiService } from './onboarding-ai.service';

@Module({
  imports: [AuthModule],
  controllers: [OnboardingAiController],
  providers: [OnboardingAiService],
  exports: [OnboardingAiService],
})
export class OnboardingAiModule {}
