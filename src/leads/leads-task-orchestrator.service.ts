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

@Injectable()
export class LeadsTaskOrchestratorService {
  private readonly logger = new Logger(LeadsTaskOrchestratorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly leadsService: LeadsService,
    private readonly queue: AiTaskQueueService,
    private readonly runner: AiTaskRunnerService,
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
        return this.discoverProspectsLegacy(dto, userId);
      }

      const completed = await this.waitForTask(taskId, 120_000);
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

    return this.discoverProspectsLegacy(dto, userId);
  }

  async analyzeBusiness(leadId: string, userId?: string) {
    const inline = await this.runner.runInline<
      { leadId: string },
      LeadBusinessDiagnosis
    >('leads.business_diagnosis', { leadId }, { userId, leadId });

    const analysis = await this.prisma.leadAnalysis.create({
      data: {
        leadId,
        type: LeadAnalysisType.BUSINESS_DIAGNOSIS,
        content: inline.output as object,
        model: 'gemini',
        createdById: userId,
        aiExecutionId: inline.executionId || undefined,
        costUsd: inline.totalCostUsd,
        durationMs: inline.durationMs,
        confidence: inline.confidence,
        approvalStatus: LeadAnalysisApprovalStatus.DRAFT,
      },
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

    return this.prisma.leadAnalysis.create({
      data: {
        leadId,
        type: MESSAGE_TYPES[channel],
        content: inline.output as object,
        model: 'gemini',
        createdById: userId,
        aiExecutionId: inline.executionId || undefined,
        costUsd: inline.totalCostUsd,
        durationMs: inline.durationMs,
        confidence: inline.confidence,
        approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW,
      },
    });
  }

  async importWithAutoAnalyze(dto: ImportLeadsDto, userId?: string) {
    const result = await this.leadsService.importCandidates(
      dto.candidates.map((c) => ({
        ...c,
        discoveredWithAi: c.discoveredWithAi ?? true,
        discoverySessionId:
          c.discoverySessionId ?? dto.discoverySessionId ?? undefined,
      })),
      userId,
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

  private async discoverProspectsLegacy(
    dto: DiscoverLeadsDto,
    userId?: string,
  ): Promise<LeadDiscoveryResult> {
    const inline = await this.runner.runInline<
      DiscoverLeadsDto,
      LeadDiscoveryResult
    >('leads.discover_restaurants', dto, { userId });
    return inline.output;
  }

  private async waitForTask(taskId: string, timeoutMs: number) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const task = await this.prisma.aiTask.findUnique({
        where: { id: taskId },
      });
      if (!task) throw new Error('Task not found');
      if (task.status === 'COMPLETED' || task.status === 'AWAITING_APPROVAL') {
        return task;
      }
      if (task.status === 'FAILED' || task.status === 'CANCELLED') {
        throw new Error(
          (task.error as { message?: string })?.message ??
            'Discovery task failed',
        );
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Discovery task timed out');
  }
}
