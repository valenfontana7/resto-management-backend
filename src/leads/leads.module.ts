import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadsAiService } from './leads-ai.service';
import { LeadScoringService } from './lead-scoring.service';
import { LeadsSavedSearchService } from './leads-saved-search.service';
import { LeadsDiscoverySchedulerService } from './leads-discovery-scheduler.service';

@Module({
  imports: [PrismaModule, CommonModule, ScheduleModule.forRoot()],
  controllers: [LeadsController],
  providers: [
    LeadsService,
    LeadsAiService,
    LeadScoringService,
    LeadsSavedSearchService,
    LeadsDiscoverySchedulerService,
  ],
  exports: [LeadsService],
})
export class LeadsModule {}
