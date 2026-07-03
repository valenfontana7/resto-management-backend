import { Injectable, Logger } from '@nestjs/common';
import {
  AiTaskStatus,
  LeadAnalysisApprovalStatus,
  LeadAnalysisType,
  PlanStepStatus,
  PlannerEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiInsightsService } from './ai-insights.service';
import { PlannerTimelineService } from './planner-timeline.service';
import { PlanExecutorService } from './plan-executor.service';

const APPROVAL_TASK_KEYS = new Set([
  'leads.draft_message_instagram',
  'leads.draft_message_whatsapp',
  'leads.draft_message_email',
  'leads.draft_followup',
  'leads.generate_demo',
  'leads.generate_proposal',
]);

function mapDemoOutreachChannelToAnalysisType(
  channel: unknown,
): LeadAnalysisType {
  if (channel === 'instagram') return LeadAnalysisType.INSTAGRAM_MESSAGE;
  if (channel === 'email') return LeadAnalysisType.EMAIL_MESSAGE;
  return LeadAnalysisType.WHATSAPP_MESSAGE;
}

function mapTaskKeyToAnalysisType(
  taskKey: string,
  input: unknown,
): LeadAnalysisType | null {
  switch (taskKey) {
    case 'leads.draft_message_instagram':
      return LeadAnalysisType.INSTAGRAM_MESSAGE;
    case 'leads.draft_message_whatsapp':
      return LeadAnalysisType.WHATSAPP_MESSAGE;
    case 'leads.draft_message_email':
      return LeadAnalysisType.EMAIL_MESSAGE;
    case 'leads.draft_followup': {
      const channel = (input as { channel?: string })?.channel;
      if (channel === 'instagram') return LeadAnalysisType.INSTAGRAM_MESSAGE;
      if (channel === 'email') return LeadAnalysisType.EMAIL_MESSAGE;
      return LeadAnalysisType.WHATSAPP_MESSAGE;
    }
    case 'leads.generate_demo':
    case 'leads.generate_proposal':
      return LeadAnalysisType.BUSINESS_DIAGNOSIS;
    default:
      return null;
  }
}

@Injectable()
export class PlanApprovalBridgeService {
  private readonly logger = new Logger(PlanApprovalBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly timeline: PlannerTimelineService,
    private readonly insights: AiInsightsService,
    private readonly planExecutor: PlanExecutorService,
  ) {}

  async ensureApprovalRecord(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { execution: true },
    });
    if (
      !task ||
      task.status !== AiTaskStatus.AWAITING_APPROVAL ||
      !task.leadId ||
      !APPROVAL_TASK_KEYS.has(task.taskKey)
    ) {
      return null;
    }

    const output = (task.output ?? {}) as Record<string, unknown>;
    const analysisType =
      task.taskKey === 'leads.generate_demo'
        ? mapDemoOutreachChannelToAnalysisType(output.channel)
        : mapTaskKeyToAnalysisType(task.taskKey, task.input);
    if (!analysisType) return null;

    const content = {
      ...output,
      _taskKey: task.taskKey,
    } as Prisma.InputJsonValue;

    const existing = await this.prisma.leadAnalysis.findFirst({
      where: { aiTaskId: taskId },
    });

    if (existing) {
      return this.prisma.leadAnalysis.update({
        where: { id: existing.id },
        data: {
          type: analysisType,
          content,
          model: task.execution?.model ?? task.selectedModel ?? undefined,
          aiExecutionId: task.executionId ?? undefined,
          costUsd: task.execution?.totalCostUsd,
          durationMs: task.execution?.durationMs ?? undefined,
          approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW,
        },
      });
    }

    return this.prisma.leadAnalysis.create({
      data: {
        leadId: task.leadId,
        type: analysisType,
        content,
        model: task.execution?.model ?? task.selectedModel ?? undefined,
        createdById: task.createdById ?? undefined,
        aiTaskId: task.id,
        aiExecutionId: task.executionId ?? undefined,
        costUsd: task.execution?.totalCostUsd,
        durationMs: task.execution?.durationMs ?? undefined,
        approvalStatus: LeadAnalysisApprovalStatus.PENDING_REVIEW,
      },
    });
  }

  async resumePlanAfterApproval(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { execution: true },
    });
    if (!task?.planStepId || !task.planId) return false;
    if (task.status !== AiTaskStatus.AWAITING_APPROVAL) return false;

    const cost = Number(task.execution?.totalCostUsd ?? 0);

    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: { status: AiTaskStatus.COMPLETED },
    });

    await this.prisma.executionPlanStep.update({
      where: { id: task.planStepId },
      data: {
        status: PlanStepStatus.COMPLETED,
        actualCostUsd: cost,
        output: task.output as Prisma.InputJsonValue,
      },
    });

    await this.timeline.record({
      planId: task.planId,
      stepId: task.planStepId,
      taskId,
      eventType: PlannerEventType.STEP_COMPLETED,
      title: `Aprobado y completado: ${task.taskKey}`,
      costUsd: cost,
    });

    if (task.goalId && cost > 0) {
      await this.prisma.aiGoal.update({
        where: { id: task.goalId },
        data: {
          achievedCount: { increment: 1 },
        },
      });
    }

    await this.planExecutor.advancePlan(task.planId);
    if (task.goalId) {
      await this.insights.generateForGoal(task.goalId);
    }

    this.logger.log(
      `Plan ${task.planId} resumed after approval of task ${taskId}`,
    );
    return true;
  }

  async failPlanAfterRejection(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { execution: true },
    });
    if (!task?.planStepId || !task.planId) return false;
    if (task.status !== AiTaskStatus.AWAITING_APPROVAL) return false;

    const cost = Number(task.execution?.totalCostUsd ?? 0);

    await this.prisma.aiTask.update({
      where: { id: taskId },
      data: { status: AiTaskStatus.FAILED },
    });

    await this.prisma.executionPlanStep.update({
      where: { id: task.planStepId },
      data: {
        status: PlanStepStatus.FAILED,
        actualCostUsd: cost,
      },
    });

    await this.timeline.record({
      planId: task.planId,
      stepId: task.planStepId,
      taskId,
      eventType: PlannerEventType.STEP_FAILED,
      title: `Rechazado: ${task.taskKey}`,
      costUsd: cost,
    });

    await this.planExecutor.syncPlanProgressPublic(task.planId);
    this.logger.log(
      `Plan ${task.planId} step failed after rejection of task ${taskId}`,
    );
    return true;
  }
}
