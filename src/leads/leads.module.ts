import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AiPlatformModule } from '../ai-platform/ai-platform.module';
import { CommercialIntelligenceModule } from '../commercial-intelligence/commercial-intelligence.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { LeadDemoProvisionService } from './lead-demo-provision.service';
import { LeadDemoViewService } from './lead-demo-view.service';
import { LeadApprovalService } from './approval/lead-approval.service';
import { LeadScoringService } from './lead-scoring.service';
import { PlanLeadBindingService } from './plan-lead-binding.service';
import { LeadsAiService } from './leads-ai.service';
import { LeadsController } from './leads.controller';
import { PublicLeadsController } from './public-leads.controller';
import { LeadsDiscoverySchedulerService } from './leads-discovery-scheduler.service';
import { LeadsSavedSearchService } from './leads-saved-search.service';
import { LeadsService } from './leads.service';
import { LeadsAiExecutionService } from './leads-ai-execution.service';
import { LeadAnalysisPersistenceService } from './lead-analysis-persistence.service';
import { LeadImportOrchestratorService } from './lead-import-orchestrator.service';
import { LeadsTasksRegistrar } from './leads-tasks-registrar.service';
import {
  AnalyzeClientReplyTask,
  AnalyzeDigitalPresenceTask,
  BusinessDiagnosisTask,
  DetectProblemsTask,
  DraftFollowupTask,
  DraftMessageEmailTask,
  DraftMessageInstagramTask,
  DraftMessageWhatsappTask,
  GenerateDemoTask,
  GenerateProposalTask,
  SuggestNextActionTask,
} from './tasks/leads-analysis.tasks';
import {
  CalculateScoreTask,
  DiscoverRestaurantsTask,
  EnrichCandidateTask,
} from './tasks/leads-discovery.tasks';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AiPlatformModule,
    CommercialIntelligenceModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [LeadsController, PublicLeadsController],
  providers: [
    LeadsService,
    LeadsAiService,
    LeadScoringService,
    LeadsSavedSearchService,
    LeadsDiscoverySchedulerService,
    LeadsAiExecutionService,
    LeadAnalysisPersistenceService,
    LeadImportOrchestratorService,
    LeadApprovalService,
    LeadDemoProvisionService,
    LeadDemoViewService,
    PlanLeadBindingService,
    LeadsTasksRegistrar,
    DiscoverRestaurantsTask,
    EnrichCandidateTask,
    CalculateScoreTask,
    AnalyzeDigitalPresenceTask,
    DetectProblemsTask,
    BusinessDiagnosisTask,
    SuggestNextActionTask,
    DraftMessageInstagramTask,
    DraftMessageWhatsappTask,
    DraftMessageEmailTask,
    DraftFollowupTask,
    AnalyzeClientReplyTask,
    GenerateProposalTask,
    GenerateDemoTask,
  ],
  exports: [LeadsService, LeadsAiExecutionService, LeadDemoViewService],
})
export class LeadsModule {}
