import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EmailModule } from '../email/email.module';
import { DigestPreferencesService } from './digest-preferences.service';
import { DigestSchedulerService } from './digest-scheduler.service';
import { DigestController } from './digest.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    AnalyticsModule,
    EmailModule,
  ],
  controllers: [DigestController],
  providers: [DigestPreferencesService, DigestSchedulerService],
  exports: [DigestPreferencesService],
})
export class DigestModule {}
