import { Injectable, Logger } from '@nestjs/common';
import {
  Lead,
  LeadAnalysisApprovalStatus,
  LeadAnalysisType,
  LeadStatus,
  Prisma,
} from '@prisma/client';
import { AiTaskQueueService } from '../ai-platform/queue/ai-task-queue.service';
import { AiTaskRunnerService } from '../ai-platform/tasks/ai-task-runner.service';
import { PrismaService } from '../prisma/prisma.service';
import { DiscoverLeadsDto } from './dto/discover-leads.dto';
import { ImportLeadsDto } from './dto/import-leads.dto';
import { LeadAnalysisPersistenceService } from './lead-analysis-persistence.service';
import { LeadImportOrchestratorService } from './lead-import-orchestrator.service';
import type { ImportLeadsExtendedResult } from './lead-import-orchestrator.service';
import { LeadProspectPackageService } from './lead-prospect-package.service';
import { LeadsService } from './leads.service';
import {
  buildInitialPipelineReport,
  getPipelineProgress,
  isPipelineInFlight,
  setPipelineProgress,
} from './pipeline-progress.store';
import type {
  LeadBusinessDiagnosis,
  LeadMessageContent,
} from './types/lead-ai.types';
import type { LeadDiscoveryResult } from './types/lead-discovery.types';
import type { GenerateProspectBundleOutput } from './tasks/leads-prospect-package.tasks';
import type { ProspectPipelineReport } from './types/prospect-pipeline.types';

const MESSAGE_TASK_KEYS = {
  instagram: 'leads.draft_message_instagram',
  whatsapp: 'leads.draft_message_whatsapp',
  email: 'leads.draft_message_email',
} as const;

const MESSAGE_TYPES = {
  instagram: LeadAnalysisType.INSTAGRAM_MESSAGE,
  whatsapp: LeadAnalysisType.WHATSAPP_MESSAGE,
  email: LeadAnalysisType.EMAIL_MESSAGE,
} as const;

/**
 * Punto de entrada ad-hoc para AI Tasks de leads (fuera del Planner).
 * Usa Execution Platform: AiTaskQueue + AiTaskRunner + persistencia LeadAnalysis.
 */
@Injectable()
export class LeadsAiExecutionService {
  private readonly logger = new Logger(LeadsAiExecutionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly queue: AiTaskQueueService,
    private readonly runner: AiTaskRunnerService,
    private readonly analysisPersistence: LeadAnalysisPersistenceService,
    private readonly importOrchestrator: LeadImportOrchestratorService,
    private readonly leadProspectPackage: LeadProspectPackageService,
  ) {}

  async discoverProspects(
    dto: DiscoverLeadsDto,
    userId?: string,
  ): Promise<LeadDiscoveryResult> {
    const useQueue = process.env.LEADS_AI_TASKS_ENABLED !== 'false';

    if (useQueue) {
      const task = await this.queue.enqueue({
        taskKey: 'leads.discover_restaurants',
        input: dto as unknown as Record<string, unknown>,
        createdById: userId,
      });

      const taskId =
        typeof task === 'object' && task && 'id' in task ? task.id : null;
      if (!taskId) {
        return this.discoverProspectsInline(dto, userId);
      }

      const completed = await this.queue.waitForCompletion(taskId, 120_000);
      const output = completed.output as LeadDiscoveryResult | null;

      if (!output) {
        throw new Error('Discovery task completed without output');
      }

      const session = await this.prisma.leadDiscoverySession.create({
        data: {
          query: dto.query,
          filters: {
            city: dto.city,
            category: dto.category,
            maxResults: dto.maxResults ?? 10,
          } as Prisma.InputJsonValue,
          results: output as unknown as Prisma.InputJsonValue,
          model: 'gemini-2.5-flash',
          createdById: userId,
        },
      });

      return { ...output, sessionId: session.id };
    }

    return this.discoverProspectsInline(dto, userId);
  }

  async analyzeBusiness(leadId: string, userId?: string) {
    const inline = await this.runner.runInline<
      { leadId: string },
      LeadBusinessDiagnosis
    >('leads.business_diagnosis', { leadId }, { userId, leadId });

    const analysis = await this.analysisPersistence.createFromTaskRun({
      leadId,
      type: LeadAnalysisType.BUSINESS_DIAGNOSIS,
      content: inline.output as object,
      taskId: inline.taskId,
      executionId: inline.executionId || undefined,
      taskKey: 'leads.business_diagnosis',
      createdById: userId,
      costUsd: inline.totalCostUsd,
      durationMs: inline.durationMs,
      confidence: inline.confidence,
      approvalStatus: LeadAnalysisApprovalStatus.DRAFT,
    });

    const lead = await this.leadsService.findOne(leadId);
    if (lead.status === LeadStatus.NEW) {
      await this.leadsService.updateStatus(leadId, LeadStatus.ANALYZED, userId);
    }

    return analysis;
  }

  async generateMessage(
    leadId: string,
    channel: 'instagram' | 'whatsapp' | 'email',
    userId?: string,
  ) {
    const taskKey = MESSAGE_TASK_KEYS[channel];
    const inline = await this.runner.runInline<
      { leadId: string },
      LeadMessageContent
    >(taskKey, { leadId }, { userId, leadId });

    return this.analysisPersistence.createFromTaskRun({
      leadId,
      type: MESSAGE_TYPES[channel],
      content: inline.output as object,
      taskId: inline.taskId,
      executionId: inline.executionId || undefined,
      taskKey,
      createdById: userId,
      costUsd: inline.totalCostUsd,
      durationMs: inline.durationMs,
      confidence: inline.confidence,
      approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW,
    });
  }

  async generateProspectPackage(
    leadId: string,
    userId?: string,
    options?: { wait?: boolean; autoImport?: boolean },
  ) {
    const input = {
      leadId,
      autoImport: options?.autoImport ?? false,
    };

    const shouldWaitInline =
      options?.wait === true || process.env.LEADS_AI_TASKS_ENABLED === 'false';

    if (!shouldWaitInline) {
      const task = await this.queue.enqueue({
        taskKey: 'leads.generate_prospect_bundle',
        input: input as unknown as Record<string, unknown>,
        leadId,
        createdById: userId,
        runImmediately: !process.env.REDIS_URL,
      });

      const taskId =
        typeof task === 'object' && task && 'id' in task
          ? String(task.id)
          : null;

      if (taskId && !process.env.REDIS_URL) {
        const completed = await this.queue.waitForCompletion(taskId, 180_000);
        return this.buildGenerateProspectPackageResponse(
          leadId,
          userId,
          completed.output as GenerateProspectBundleOutput | null,
          taskId,
          options?.autoImport,
        );
      }

      return { taskId, status: 'queued' as const };
    }

    const inline = await this.runner.runInline<
      typeof input,
      GenerateProspectBundleOutput
    >('leads.generate_prospect_bundle', input, { userId, leadId });

    return this.buildGenerateProspectPackageResponse(
      leadId,
      userId,
      inline.output,
      inline.taskId,
      options?.autoImport,
      inline.totalCostUsd,
      inline.durationMs,
    );
  }

  async getProspectPackageGeneration(taskId: string, leadId: string) {
    const task = await this.queue.getTask(taskId);
    if (task.leadId && task.leadId !== leadId) {
      throw new Error('La tarea no pertenece a este prospecto');
    }
    return task;
  }

  async runProspectPipeline(
    leadId: string,
    userId?: string,
    options?: {
      skipImport?: boolean;
      skipImages?: boolean;
      skipSalesPackage?: boolean;
    },
  ) {
    const inFlight = getPipelineProgress(leadId);
    if (inFlight && isPipelineInFlight(leadId)) {
      return {
        status: 'running' as const,
        pipelineReport: inFlight,
      };
    }

    const input = {
      leadId,
      skipImport: options?.skipImport ?? false,
      skipImages: options?.skipImages ?? false,
      skipSalesPackage: options?.skipSalesPackage ?? false,
    };

    const seeded = buildInitialPipelineReport(leadId);
    setPipelineProgress(leadId, seeded);

    void this.runner
      .runInline<
        typeof input,
        ProspectPipelineReport
      >('leads.run_prospect_pipeline', input, { userId, leadId })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Prospect pipeline background run failed for ${leadId}: ${message}`,
        );
        const current = getPipelineProgress(leadId) ?? seeded;
        setPipelineProgress(leadId, {
          ...current,
          success: false,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - Date.parse(current.startedAt),
          errors: [...current.errors, message],
          stages: current.stages.map((stage) => {
            if (stage.id === 'report') {
              return {
                ...stage,
                status: 'failed',
                message,
                completedAt: new Date().toISOString(),
              };
            }
            if (stage.status === 'running' || stage.status === 'pending') {
              return {
                ...stage,
                status: 'skipped',
                message: 'Omitido tras fallo del runner',
              };
            }
            return stage;
          }),
        });
      });

    return {
      status: 'running' as const,
      pipelineReport: getPipelineProgress(leadId) ?? seeded,
    };
  }

  async getProspectPipeline(leadId: string) {
    const memory = getPipelineProgress(leadId);
    const artifacts =
      await this.leadProspectPackage.getPipelineArtifacts(leadId);
    if (memory) {
      return {
        ...artifacts,
        pipelineReport: memory,
        status: isPipelineInFlight(leadId)
          ? ('running' as const)
          : ('completed' as const),
      };
    }
    return {
      ...artifacts,
      status: artifacts.pipelineReport
        ? ('completed' as const)
        : ('idle' as const),
    };
  }

  async importWithAutoAnalyze(
    dto: ImportLeadsDto,
    userId?: string,
    postProcessMode: 'off' | 'suggest' | 'auto' = 'suggest',
  ): Promise<ImportLeadsExtendedResult> {
    const result = await this.importOrchestrator.importWithIntelligence(
      dto,
      userId,
      postProcessMode,
    );

    if (dto.autoAnalyze && result.created.length > 0) {
      for (const lead of result.created as Lead[]) {
        try {
          await this.queue.enqueue({
            taskKey: 'leads.business_diagnosis',
            input: { leadId: lead.id },
            leadId: lead.id,
            createdById: userId,
            runImmediately: !process.env.REDIS_URL,
          });
        } catch (error) {
          this.logger.warn(
            `Auto-analyze enqueue failed for ${lead.id}: ${error}`,
          );
        }
      }
    }

    return result;
  }

  private async discoverProspectsInline(
    dto: DiscoverLeadsDto,
    userId?: string,
  ): Promise<LeadDiscoveryResult> {
    const inline = await this.runner.runInline<
      DiscoverLeadsDto,
      LeadDiscoveryResult
    >('leads.discover_restaurants', dto, { userId });
    return inline.output;
  }

  private async buildGenerateProspectPackageResponse(
    leadId: string,
    userId: string | undefined,
    output: GenerateProspectBundleOutput | null,
    taskId: string | null,
    autoImport?: boolean,
    totalCostUsd?: number,
    durationMs?: number,
  ) {
    if (!output?.bundle) {
      throw new Error('La generación no devolvió un bundle');
    }

    let importReport: Awaited<
      ReturnType<LeadProspectPackageService['importBundleForLead']>
    > | null = null;
    if (autoImport && output.validation.errors.length === 0) {
      importReport = await this.leadProspectPackage.importBundleForLead(
        leadId,
        output.bundle,
        { importedBy: userId },
      );
    }

    return {
      taskId,
      status: 'completed' as const,
      bundle: output.bundle,
      validation: output.validation,
      researchSummary: output.researchSummary,
      importReport,
      totalCostUsd,
      durationMs,
    };
  }
}
