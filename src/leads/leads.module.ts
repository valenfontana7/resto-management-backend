import { Module } from '@nestjs/common';
import { AiPlatformModule } from '../ai-platform/ai-platform.module';
import { CommercialIntelligenceModule } from '../commercial-intelligence/commercial-intelligence.module';
import { RevenueModule } from '../revenue/revenue.module';
import { ProspectImporterModule } from '../prospect-importer/prospect-importer.module';
import { CommonModule } from '../common/common.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { LeadDemoProvisionService } from './lead-demo-provision.service';
import { LeadProspectPackageService } from './lead-prospect-package.service';
import { LeadProspectBundleGeneratorService } from './lead-prospect-bundle-generator.service';
import { LeadProspectImageService } from './lead-prospect-image.service';
import { LeadProspectPipelineService } from './lead-prospect-pipeline.service';
import { LeadSalesPackageGeneratorService } from './lead-sales-package-generator.service';
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
import { GenerateProspectBundleTask } from './tasks/leads-prospect-package.tasks';
import { RunProspectPipelineTask } from './tasks/leads-prospect-pipeline.tasks';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    AiPlatformModule,
    CommercialIntelligenceModule,
    RevenueModule,
    ProspectImporterModule,
    StorageModule,
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
    LeadProspectPackageService,
    LeadProspectBundleGeneratorService,
    LeadProspectImageService,
    LeadProspectPipelineService,
    LeadSalesPackageGeneratorService,
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
    GenerateProspectBundleTask,
    RunProspectPipelineTask,
  ],
  exports: [LeadsService, LeadsAiExecutionService, LeadDemoViewService],
})
export class LeadsModule {}
