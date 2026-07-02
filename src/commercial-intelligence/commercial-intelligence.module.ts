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
  ],
  exports: [
    CommercialConfigService,
    ActionCostEstimatorService,
    ExpectedValueEngineService,
    CommercialTodayService,
  ],
})
export class CommercialIntelligenceModule {}
