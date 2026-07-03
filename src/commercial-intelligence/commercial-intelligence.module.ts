import { Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';

import { AiPlatformModule } from '../ai-platform/ai-platform.module';

import { CommercialIntelligenceController } from './commercial-intelligence.controller';

import { CommercialConfigService } from './config/commercial-config.service';

import { ActionCostEstimatorService } from './pricing/action-cost-estimator.service';

import { ActionCatalogService } from './catalog/action-catalog.service';

import { ExpectedValueEngineService } from './decisioning/expected-value-engine.service';

import {
  CommercialDecisionService,
  CommercialTodayService,
} from './decisioning/commercial-today.service';

import { CommercialAutonomyService } from './decisioning/commercial-autonomy.service';

import { CommercialActionOrchestratorService } from './decisioning/commercial-action-orchestrator.service';

import { CommercialAutoExecutorService } from './decisioning/commercial-auto-executor.service';

import { OpportunitySensorService } from './sensing/opportunity-sensor.service';

import { OpportunityFeedService } from './read-models/opportunity-feed.service';

import { CommercialLearningService } from './read-models/commercial-learning.service';

import { CommercialWorkQueueService } from './read-models/commercial-work-queue.service';

import { CommercialReactiveSensingHandler } from './events/commercial-reactive-sensing.handler';

@Module({
  imports: [PrismaModule, AiPlatformModule],

  controllers: [CommercialIntelligenceController],

  providers: [
    CommercialConfigService,

    ActionCostEstimatorService,

    ActionCatalogService,

    ExpectedValueEngineService,

    CommercialTodayService,

    CommercialDecisionService,

    CommercialAutonomyService,

    CommercialActionOrchestratorService,

    CommercialAutoExecutorService,

    OpportunitySensorService,

    OpportunityFeedService,

    CommercialLearningService,

    CommercialWorkQueueService,

    CommercialReactiveSensingHandler,
  ],

  exports: [
    CommercialConfigService,

    ActionCostEstimatorService,

    ExpectedValueEngineService,

    CommercialTodayService,

    CommercialDecisionService,

    CommercialAutonomyService,

    CommercialActionOrchestratorService,

    OpportunityFeedService,

    CommercialLearningService,

    CommercialWorkQueueService,

    CommercialReactiveSensingHandler,
  ],
})
export class CommercialIntelligenceModule {}
