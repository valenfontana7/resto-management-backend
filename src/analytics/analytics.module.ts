import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPdfService } from './analytics-pdf.service';
import { DecisionAnalyticsService } from './decision-analytics.service';
import { PrismaService } from '../prisma/prisma.service';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [CommonModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsService,
    AnalyticsPdfService,
    DecisionAnalyticsService,
    PrismaService,
  ],
  exports: [AnalyticsService, DecisionAnalyticsService],
})
export class AnalyticsModule {}
