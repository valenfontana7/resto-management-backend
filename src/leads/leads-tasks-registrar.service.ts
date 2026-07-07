import { Injectable, OnModuleInit } from '@nestjs/common';
import { AiTaskRegistry } from '../ai-platform/tasks/ai-task-registry.service';
import type { AiTaskHandler } from '../ai-platform/types/ai-task.types';
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

@Injectable()
export class LeadsTasksRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: AiTaskRegistry,
    private readonly discover: DiscoverRestaurantsTask,
    private readonly enrich: EnrichCandidateTask,
    private readonly score: CalculateScoreTask,
    private readonly digital: AnalyzeDigitalPresenceTask,
    private readonly problems: DetectProblemsTask,
    private readonly diagnosis: BusinessDiagnosisTask,
    private readonly suggest: SuggestNextActionTask,
    private readonly msgIg: DraftMessageInstagramTask,
    private readonly msgWa: DraftMessageWhatsappTask,
    private readonly msgEmail: DraftMessageEmailTask,
    private readonly followup: DraftFollowupTask,
    private readonly analyzeReply: AnalyzeClientReplyTask,
    private readonly proposal: GenerateProposalTask,
    private readonly demo: GenerateDemoTask,
    private readonly prospectBundle: GenerateProspectBundleTask,
    private readonly prospectPipeline: RunProspectPipelineTask,
  ) {}

  onModuleInit(): void {
    const handlers: AiTaskHandler[] = [
      this.discover,
      this.enrich,
      this.score,
      this.digital,
      this.problems,
      this.diagnosis,
      this.suggest,
      this.msgIg,
      this.msgWa,
      this.msgEmail,
      this.followup,
      this.analyzeReply,
      this.proposal,
      this.demo,
      this.prospectBundle,
      this.prospectPipeline,
    ];
    this.registry.registerMany(handlers);
  }
}
