import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { EmailModule } from '../email/email.module';
import { BusinessHealthModule } from '../business-health/business-health.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { OperationsModule } from '../operations/operations.module';
import { DigestPreferencesService } from './digest-preferences.service';
import { DigestSchedulerService } from './digest-scheduler.service';
import { DigestController } from './digest.controller';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AnalyticsModule,
    EmailModule,
    BusinessHealthModule,
    BusinessEventsModule,
    OperationsModule,
  ],
  controllers: [DigestController],
  providers: [DigestPreferencesService, DigestSchedulerService],
  exports: [DigestPreferencesService],
})
export class DigestModule {}
