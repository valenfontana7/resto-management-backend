import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LeadAnalysisApprovalStatus,
  LeadAnalysisType,
  LeadStatus,
  PlanStepStatus,
  Prisma,
} from '@prisma/client';
import { AiTaskRunnerService } from '../../ai-platform/tasks/ai-task-runner.service';
import { PlanApprovalBridgeService } from '../../ai-platform/planner/plan-approval-bridge.service';
import { PrismaService } from '../../prisma/prisma.service';

const EDITABLE_STATUSES: LeadAnalysisApprovalStatus[] = [
  LeadAnalysisApprovalStatus.DRAFT,
  LeadAnalysisApprovalStatus.PENDING_REVIEW,
];

const MESSAGE_TASK_KEYS = {
  [LeadAnalysisType.INSTAGRAM_MESSAGE]: 'leads.draft_message_instagram',
  [LeadAnalysisType.WHATSAPP_MESSAGE]: 'leads.draft_message_whatsapp',
  [LeadAnalysisType.EMAIL_MESSAGE]: 'leads.draft_message_email',
} as const;

function taskOutputFromContent(content: Record<string, unknown>) {
  const { _taskKey: _ignored, ...output } = content;
  void _ignored;
  return output;
}

@Injectable()
export class LeadApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planApprovalBridge: PlanApprovalBridgeService,
    private readonly runner: AiTaskRunnerService,
  ) {}

  async approve(analysisId: string, userId: string) {
    const analysis = await this.ensureAnalysis(analysisId);
    const updated = await this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        approvalStatus: LeadAnalysisApprovalStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    if (analysis.aiTaskId) {
      await this.planApprovalBridge.resumePlanAfterApproval(analysis.aiTaskId);
    }

    return updated;
  }

  async reject(analysisId: string, userId: string) {
    const analysis = await this.ensureAnalysis(analysisId);
    const updated = await this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        approvalStatus: LeadAnalysisApprovalStatus.REJECTED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    if (analysis.aiTaskId) {
      await this.planApprovalBridge.failPlanAfterRejection(analysis.aiTaskId);
    }

    return updated;
  }

  async markSent(analysisId: string, userId: string) {
    void userId;
    const analysis = await this.ensureAnalysis(analysisId);
    if (analysis.approvalStatus !== LeadAnalysisApprovalStatus.APPROVED) {
      throw new BadRequestException(
        'El mensaje debe estar aprobado antes de marcar como enviado',
      );
    }

    const updated = await this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        approvalStatus: LeadAnalysisApprovalStatus.SENT,
        sentAt: new Date(),
      },
    });

    if (analysis.lead.status === LeadStatus.ANALYZED) {
      await this.prisma.lead.update({
        where: { id: analysis.leadId },
        data: { status: LeadStatus.CONTACTED },
      });
    }

    return updated;
  }

  async updateContent(
    analysisId: string,
    userId: string,
    content: Record<string, unknown>,
  ) {
    void userId;
    const analysis = await this.ensureAnalysis(analysisId);
    this.assertEditable(analysis.approvalStatus);

    const existing = analysis.content as Record<string, unknown>;
    const merged = {
      ...content,
      ...(typeof existing._taskKey === 'string'
        ? { _taskKey: existing._taskKey }
        : {}),
    };

    const updated = await this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: { content: merged as Prisma.InputJsonValue },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
          },
        },
      },
    });

    await this.syncLinkedTaskOutput(analysis.aiTaskId, merged);
    return updated;
  }

  async regenerate(analysisId: string, userId: string) {
    const analysis = await this.ensureAnalysis(analysisId);
    this.assertEditable(analysis.approvalStatus);

    const content = analysis.content as Record<string, unknown>;
    const taskKey =
      typeof content._taskKey === 'string'
        ? content._taskKey
        : MESSAGE_TASK_KEYS[analysis.type as keyof typeof MESSAGE_TASK_KEYS];

    if (!taskKey) {
      throw new BadRequestException(
        'No se puede regenerar este tipo de contenido automáticamente',
      );
    }

    if (analysis.aiTaskId) {
      const task = await this.prisma.aiTask.findUnique({
        where: { id: analysis.aiTaskId },
      });
      if (task?.planStepId) {
        await this.prisma.executionPlanStep.update({
          where: { id: task.planStepId },
          data: { status: PlanStepStatus.RUNNING },
        });
      }

      await this.runner.retryTask(analysis.aiTaskId, userId);
      await this.planApprovalBridge.ensureApprovalRecord(analysis.aiTaskId);

      return this.prisma.leadAnalysis.findUniqueOrThrow({
        where: { id: analysisId },
        include: {
          lead: {
            select: {
              id: true,
              businessName: true,
              category: true,
              city: true,
            },
          },
        },
      });
    }

    const inline = await this.runner.runInline<
      { leadId: string },
      Record<string, unknown>
    >(
      taskKey,
      { leadId: analysis.leadId },
      { userId, leadId: analysis.leadId },
    );

    const nextContent = {
      ...inline.output,
      _taskKey: taskKey,
    };

    return this.prisma.leadAnalysis.update({
      where: { id: analysisId },
      data: {
        content: nextContent as Prisma.InputJsonValue,
        aiTaskId: inline.taskId,
        aiExecutionId: inline.executionId || undefined,
        costUsd: inline.totalCostUsd,
        durationMs: inline.durationMs,
        confidence: inline.confidence,
        approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW,
      },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
          },
        },
      },
    });
  }

  async listPending(limit = 50) {
    return this.prisma.leadAnalysis.findMany({
      where: {
        approvalStatus: {
          in: [
            LeadAnalysisApprovalStatus.DRAFT,
            LeadAnalysisApprovalStatus.PENDING_REVIEW,
          ],
        },
        OR: [
          {
            type: {
              in: [
                LeadAnalysisType.INSTAGRAM_MESSAGE,
                LeadAnalysisType.WHATSAPP_MESSAGE,
                LeadAnalysisType.EMAIL_MESSAGE,
              ],
            },
          },
          { aiTaskId: { not: null } },
        ],
      },
      include: {
        lead: {
          select: {
            id: true,
            businessName: true,
            category: true,
            city: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private assertEditable(status: LeadAnalysisApprovalStatus) {
    if (!EDITABLE_STATUSES.includes(status)) {
      throw new BadRequestException(
        'Solo se puede editar contenido pendiente de revisión',
      );
    }
  }

  private async syncLinkedTaskOutput(
    aiTaskId: string | null | undefined,
    content: Record<string, unknown>,
  ) {
    if (!aiTaskId) return;

    const output = taskOutputFromContent(content) as Prisma.InputJsonValue;
    const task = await this.prisma.aiTask.update({
      where: { id: aiTaskId },
      data: { output },
      select: { planStepId: true },
    });

    if (task.planStepId) {
      await this.prisma.executionPlanStep.update({
        where: { id: task.planStepId },
        data: { output },
      });
    }
  }

  private async ensureAnalysis(analysisId: string) {
    const analysis = await this.prisma.leadAnalysis.findUnique({
      where: { id: analysisId },
      include: { lead: true },
    });
    if (!analysis) throw new NotFoundException('Análisis no encontrado');
    return analysis;
  }
}
