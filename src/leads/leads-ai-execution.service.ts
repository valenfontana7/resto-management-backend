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
import { LeadsService } from './leads.service';
import type {
  LeadBusinessDiagnosis,
  LeadMessageContent,
} from './types/lead-ai.types';
import type { LeadDiscoveryResult } from './types/lead-discovery.types';

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
}
