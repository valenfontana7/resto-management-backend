import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPdfService } from './analytics-pdf.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsPdfService, PrismaService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
