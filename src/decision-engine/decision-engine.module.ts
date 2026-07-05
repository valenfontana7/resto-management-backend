import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RestaurantEventAdapterService } from './adapters/restaurant-event.adapter';
import { DecisionEngineOrchestratorService } from './decision-engine-orchestrator.service';
import { IntelligenceController } from './intelligence.controller';
import { OpportunityEngineService } from './opportunities/opportunity-engine.service';
import { OpportunityRegistry } from './opportunities/opportunity-registry.service';
import { InMemoryOpportunityStateStore } from './opportunities/stores/opportunity-state.store';
import { RecommendationEngineService } from './recommendations/recommendation-engine.service';
import { RecommendationRegistry } from './recommendations/recommendation-registry.service';
import { InMemoryRecommendationStateStore } from './recommendations/stores/recommendation-state.store';
import { DimensionRegistry } from './rss/dimension-registry.service';
import {
  RssAggregatorService,
  RssEngineService,
} from './rss/rss-engine.service';
import { InMemoryRssHistoryStore } from './rss/stores/rss-history.store';
import { SignalEngineService } from './signals/signal-engine.service';
import { SignalRegistry } from './signals/signal-registry.service';
import { InMemorySignalStateStore } from './signals/stores/signal-state.store';
import { IntelligenceSnapshotStore } from './stores/intelligence-snapshot.store';

@Module({
  imports: [PrismaModule],
  controllers: [IntelligenceController],
  providers: [
    SignalRegistry,
    SignalEngineService,
    InMemorySignalStateStore,
    DimensionRegistry,
    RssAggregatorService,
    RssEngineService,
    InMemoryRssHistoryStore,
    OpportunityRegistry,
    OpportunityEngineService,
    InMemoryOpportunityStateStore,
    RecommendationRegistry,
    RecommendationEngineService,
    InMemoryRecommendationStateStore,
    RestaurantEventAdapterService,
    DecisionEngineOrchestratorService,
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
