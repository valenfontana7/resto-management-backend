import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import {
  AiGoalStatus,
  AiTaskStatus,
  ExecutionPlanStatus,
  PlanStepStatus,
  PlannerEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AiTaskRunnerService } from '../tasks/ai-task-runner.service';
import { AiInsightsService } from './ai-insights.service';
import { PlannerTimelineService } from './planner-timeline.service';
import { getTaskCapability } from './task-capabilities.registry';

const ENTITY_REF_PATTERN = /^entity-\d+$/;

@Injectable()
export class PlanExecutorService {
  private readonly logger = new Logger(PlanExecutorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly runner: AiTaskRunnerService,
    private readonly timeline: PlannerTimelineService,
    private readonly insights: AiInsightsService,
  ) {}

  async startPlan(planId: string) {
    const plan = await this.prisma.executionPlan.findUnique({
      where: { id: planId },
      include: { goal: true },
    });
    if (!plan || plan.status !== ExecutionPlanStatus.APPROVED) {
      throw new Error('Plan must be approved before execution');
    }

    await this.prisma.executionPlan.update({
      where: { id: planId },
      data: { status: ExecutionPlanStatus.RUNNING, startedAt: new Date() },
    });
    await this.prisma.aiGoal.update({
      where: { id: plan.goalId },
      data: { status: AiGoalStatus.RUNNING },
    });

    await this.timeline.record({
      goalId: plan.goalId,
      planId,
      eventType: PlannerEventType.PLAN_STARTED,
      title: 'Ejecución del plan iniciada',
    });

    await this.advancePlan(planId);
  }

  async advancePlan(planId: string) {
    const steps = await this.prisma.executionPlanStep.findMany({
      where: { planId },
      orderBy: { sortOrder: 'asc' },
    });

    const completedIds = new Set(
      steps
        .filter(
          (s) =>
            s.status === PlanStepStatus.COMPLETED ||
            s.status === PlanStepStatus.SKIPPED,
        )
        .map((s) => s.id),
    );

    for (const step of steps) {
      if (step.status !== PlanStepStatus.PENDING) continue;

      const deps = (step.dependsOnStepIds as string[]) ?? [];
      const depsMet = deps.every((depId) => completedIds.has(depId));
      if (!depsMet) {
        await this.prisma.executionPlanStep.update({
          where: { id: step.id },
          data: { status: PlanStepStatus.WAITING_DEPENDENCY },
        });
        continue;
      }

      if (step.skipReason) {
        await this.prisma.executionPlanStep.update({
          where: { id: step.id },
          data: { status: PlanStepStatus.SKIPPED },
        });
        completedIds.add(step.id);
        await this.timeline.record({
          planId,
          stepId: step.id,
          eventType: PlannerEventType.STEP_SKIPPED,
          title: step.skipReason,
        });
        continue;
      }

      await this.enqueueStep(step, planId);
      break;
    }

    await this.syncPlanProgress(planId);
  }

  async onTaskCompleted(taskId: string) {
    const task = await this.prisma.aiTask.findUnique({
      where: { id: taskId },
      include: { execution: true },
    });
    if (!task?.planStepId || !task.planId) return;

    const step = await this.prisma.executionPlanStep.findUnique({
      where: { id: task.planStepId },
    });
    if (step?.status === PlanStepStatus.COMPLETED) return;

    const cost = Number(task.execution?.totalCostUsd ?? 0);

    if (task.status === AiTaskStatus.FAILED) {
      await this.prisma.executionPlanStep.update({
        where: { id: task.planStepId },
        data: { status: PlanStepStatus.FAILED, actualCostUsd: cost },
      });
      await this.syncPlanProgress(task.planId);
      return;
    }

    const awaitingApproval = task.status === AiTaskStatus.AWAITING_APPROVAL;
    const stepStatus = awaitingApproval
      ? PlanStepStatus.WAITING_APPROVAL
      : PlanStepStatus.COMPLETED;

    await this.prisma.executionPlanStep.update({
      where: { id: task.planStepId },
      data: {
        status: stepStatus,
        actualCostUsd: cost,
        output: task.output as Prisma.InputJsonValue,
      },
    });

    await this.timeline.record({
      planId: task.planId,
      stepId: task.planStepId,
      taskId,
      eventType: awaitingApproval
        ? PlannerEventType.STEP_STARTED
        : PlannerEventType.STEP_COMPLETED,
      title: awaitingApproval
        ? `Esperando aprobación: ${task.taskKey}`
        : `Tarea completada: ${task.taskKey}`,
      costUsd: cost,
      detail: {
        model: task.selectedModel ?? task.execution?.model,
        durationMs: task.execution?.durationMs,
      },
    });

    if (task.goalId && cost > 0) {
      await this.prisma.aiGoal.update({
        where: { id: task.goalId },
        data: { spentUsd: { increment: cost } },
      });
    }

    if (awaitingApproval) {
      return;
    }

    if (task.goalId) {
      await this.prisma.aiGoal.update({
        where: { id: task.goalId },
        data: {
          achievedCount: {
            increment: task.taskKey.includes('discover') ? 0 : 1,
          },
        },
      });
    }

    await this.advancePlan(task.planId);
    if (task.goalId) {
      await this.insights.generateForGoal(task.goalId);
    }
  }

  @Cron('*/15 * * * * *')
  async pollRunningPlans() {
    const running = await this.prisma.executionPlan.findMany({
      where: { status: ExecutionPlanStatus.RUNNING },
      select: { id: true },
      take: 5,
    });
    for (const plan of running) {
      try {
        await this.syncPlanProgress(plan.id);
      } catch (error) {
        this.logger.warn(`Plan sync failed ${plan.id}: ${error}`);
      }
    }
  }

  private async enqueueStep(
    step: {
      id: string;
      taskKey: string;
      input: unknown;
      selectedModel: string | null;
      dependsOnStepIds: unknown;
      planId: string;
      entityRef: string | null;
    },
    planId: string,
  ) {
    const plan = await this.prisma.executionPlan.findUnique({
      where: { id: planId },
      select: { goalId: true, goal: { select: { createdById: true } } },
    });
    if (!plan) return;

    const cap = getTaskCapability(step.taskKey);

    const stepInput = (step.input ?? {}) as Record<string, unknown>;
    const resolvedLeadId =
      typeof stepInput.leadId === 'string' &&
      stepInput.leadId.length > 0 &&
      !ENTITY_REF_PATTERN.test(stepInput.leadId)
        ? stepInput.leadId
        : undefined;

    if (
      step.entityRef &&
      ENTITY_REF_PATTERN.test(step.entityRef) &&
      !resolvedLeadId
    ) {
      await this.prisma.executionPlanStep.update({
        where: { id: step.id },
        data: {
          status: PlanStepStatus.WAITING_DEPENDENCY,
          skipReason: 'Esperando vinculación de lead tras discovery',
        },
      });
      return;
    }

    await this.prisma.executionPlanStep.update({
      where: { id: step.id },
      data: { status: PlanStepStatus.QUEUED },
    });

    const task = await this.prisma.aiTask.create({
      data: {
        taskKey: step.taskKey,
        input: (step.input ?? {}) as Prisma.InputJsonValue,
        leadId: resolvedLeadId,
        goalId: plan.goalId,
        planId,
        planStepId: step.id,
        dependsOnStepIds: step.dependsOnStepIds as Prisma.InputJsonValue,
        selectedModel: step.selectedModel ?? undefined,
        createdById: plan.goal.createdById,
        status: 'PENDING',
      },
    });

    await this.timeline.record({
      goalId: plan.goalId,
      planId,
      stepId: step.id,
      taskId: task.id,
      eventType: PlannerEventType.STEP_CREATED,
      title: `Tarea encolada: ${cap.label}`,
    });

    if (step.selectedModel) {
      await this.timeline.record({
        goalId: plan.goalId,
        planId,
        stepId: step.id,
        taskId: task.id,
        eventType: PlannerEventType.MODEL_SELECTED,
        title: `Modelo seleccionado: ${step.selectedModel}`,
        detail: { model: step.selectedModel },
      });
    }

    await this.runner.runTask(task.id);

    await this.prisma.executionPlanStep.update({
      where: { id: step.id },
      data: { status: PlanStepStatus.RUNNING },
    });

    await this.timeline.record({
      goalId: plan.goalId,
      planId,
      stepId: step.id,
      taskId: task.id,
      eventType: PlannerEventType.STEP_STARTED,
      title: `Ejecutando: ${cap.label}`,
    });
  }

  private async syncPlanProgress(planId: string) {
    const [steps, plan] = await Promise.all([
      this.prisma.executionPlanStep.findMany({ where: { planId } }),
      this.prisma.executionPlan.findUnique({ where: { id: planId } }),
    ]);
    if (!plan) return;

    const done = steps.filter((s) =>
      ['COMPLETED', 'SKIPPED', 'FAILED'].includes(s.status),
    ).length;
    const progress = steps.length > 0 ? (done / steps.length) * 100 : 0;

    const actualCost = steps.reduce(
      (s, step) => s + Number(step.actualCostUsd ?? 0),
      0,
    );

    const allDone = done === steps.length;
    await this.prisma.executionPlan.update({
      where: { id: planId },
      data: {
        progressPercent: progress,
        actualCostUsd: actualCost,
        ...(allDone && {
          status: ExecutionPlanStatus.COMPLETED,
          completedAt: new Date(),
        }),
      },
    });

    if (allDone) {
      await this.prisma.aiGoal.update({
        where: { id: plan.goalId },
        data: {
          status: AiGoalStatus.COMPLETED,
          progressPercent: 100,
          completedAt: new Date(),
        },
      });
      await this.timeline.record({
        goalId: plan.goalId,
        planId,
        eventType: PlannerEventType.GOAL_COMPLETED,
        title: 'Objetivo completado',
      });
    } else {
      await this.prisma.aiGoal.update({
        where: { id: plan.goalId },
        data: { progressPercent: progress },
      });
    }
  }
}
