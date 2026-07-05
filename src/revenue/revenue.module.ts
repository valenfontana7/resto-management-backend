import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DecisionEngineModule } from '../decision-engine/decision-engine.module';
import { CommercialRelationService } from './commercial-relation.service';
import { LeadRevenueSyncService } from './lead-revenue-sync.service';
import { RevenueController } from './revenue.controller';

@Module({
  imports: [PrismaModule, DecisionEngineModule],
  controllers: [RevenueController],
  providers: [CommercialRelationService, LeadRevenueSyncService],
  exports: [LeadRevenueSyncService, CommercialRelationService],
})
export class RevenueModule {}
