import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { TeamInviteService } from './team-invite.service';
import { TeamOnboardingController } from './team-onboarding.controller';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [TeamOnboardingController],
  providers: [TeamInviteService],
  exports: [TeamInviteService],
})
export class TeamOnboardingModule {}
