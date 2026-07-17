import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RestaurantEventAdapterService } from './adapters/restaurant-event.adapter';
import { DecisionEngineOrchestratorService } from './decision-engine-orchestrator.service';
import { IntelligenceRefreshSchedulerService } from './intelligence-refresh.scheduler';
import { IntelligenceController } from './intelligence.controller';
import { OpportunityEngineService } from './opportunities/opportunity-engine.service';
import { OpportunityRegistry } from './opportunities/opportunity-registry.service';
import { PrismaOpportunityStateStore } from './opportunities/stores/prisma-opportunity-state.store';
import { RecommendationEngineService } from './recommendations/recommendation-engine.service';
import { RecommendationRegistry } from './recommendations/recommendation-registry.service';
import { PrismaRecommendationStateStore } from './recommendations/stores/prisma-recommendation-state.store';
import { DimensionRegistry } from './rss/dimension-registry.service';
import {
  RssAggregatorService,
  RssEngineService,
} from './rss/rss-engine.service';
import { PrismaRssHistoryStore } from './rss/stores/prisma-rss-history.store';
import { SignalEngineService } from './signals/signal-engine.service';
import { SignalRegistry } from './signals/signal-registry.service';
import { PrismaSignalStateStore } from './signals/stores/prisma-signal-state.store';
import { IntelligenceSnapshotStore } from './stores/intelligence-snapshot.store';

@Module({
  imports: [PrismaModule],
  controllers: [IntelligenceController],
  providers: [
    SignalRegistry,
    SignalEngineService,
    PrismaSignalStateStore,
    DimensionRegistry,
    RssAggregatorService,
    RssEngineService,
    PrismaRssHistoryStore,
    OpportunityRegistry,
    OpportunityEngineService,
    PrismaOpportunityStateStore,
    RecommendationRegistry,
    RecommendationEngineService,
    PrismaRecommendationStateStore,
    RestaurantEventAdapterService,
    DecisionEngineOrchestratorService,
    IntelligenceRefreshSchedulerService,
    IntelligenceSnapshotStore,
  ],
  exports: [
    DecisionEngineOrchestratorService,
    IntelligenceSnapshotStore,
    SignalEngineService,
    RssEngineService,
    OpportunityEngineService,
    RecommendationEngineService,
  ],
})
export class DecisionEngineModule {}
