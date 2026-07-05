import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionEngineModule } from '../decision-engine/decision-engine.module';
import { LifecycleMarketingModule } from '../lifecycle-marketing/lifecycle-marketing.module';
import { CustomerEngagementModule } from '../customer-engagement/customer-engagement.module';
import { MarketingHubController } from './marketing-hub.controller';
import { MarketingHubService } from './services/marketing-hub.service';
import { MarketingSegmentsService } from './services/marketing-segments.service';
import { MarketingDeliveriesQueryService } from './services/marketing-deliveries-query.service';

@Module({
  imports: [
    PrismaModule,
    DecisionEngineModule,
    LifecycleMarketingModule,
    CustomerEngagementModule,
  ],
  controllers: [MarketingHubController],
  providers: [
    MarketingHubService,
    MarketingSegmentsService,
    MarketingDeliveriesQueryService,
  ],
  exports: [MarketingHubService],
})
export class MarketingHubModule {}
