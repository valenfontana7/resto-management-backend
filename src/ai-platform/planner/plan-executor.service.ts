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

/** Pasos demo opcionales: si fallan, el plan sigue con outreach. */
const OPTIONAL_DEMO_TASK_KEYS = new Set([
  'leads.generate_prospect_bundle',
  'leads.run_prospect_pipeline',
]);

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
            s.status === PlanStepStatus.SKIPPED ||
            s.status === PlanStepStatus.FAILED,
        )
        .map((s) => s.id),
    );

    for (const step of steps) {
      if (
        step.status !== PlanStepStatus.PENDING &&
        step.status !== PlanStepStatus.WAITING_DEPENDENCY
      ) {
        continue;
      }

      const deps = (step.dependsOnStepIds as string[]) ?? [];
      const depsMet = deps.every((depId) => completedIds.has(depId));
      if (!depsMet) {
        if (step.status === PlanStepStatus.PENDING) {
          await this.prisma.executionPlanStep.update({
            where: { id: step.id },
            data: { status: PlanStepStatus.WAITING_DEPENDENCY },
          });
        }
        continue;
      }

      if (step.status === PlanStepStatus.WAITING_DEPENDENCY) {
        await this.prisma.executionPlanStep.update({
          where: { id: step.id },
          data: { status: PlanStepStatus.PENDING },
        });
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
      const errorMessage =
        typeof task.error === 'object' &&
        task.error !== null &&
        'message' in task.error &&
        typeof (task.error as { message?: unknown }).message === 'string'
          ? (task.error as { message: string }).message
          : 'Error desconocido';

      if (OPTIONAL_DEMO_TASK_KEYS.has(task.taskKey)) {
        await this.prisma.executionPlanStep.update({
          where: { id: task.planStepId },
          data: {
            status: PlanStepStatus.SKIPPED,
            actualCostUsd: cost,
            skipReason: `Demo opcional no completada: ${errorMessage}`,
            output: task.error as Prisma.InputJsonValue,
          },
        });
        await this.timeline.record({
          planId: task.planId,
          stepId: task.planStepId,
          taskId,
          eventType: PlannerEventType.STEP_SKIPPED,
          title: `Demo opcional omitida: ${task.taskKey}`,
          detail: { error: errorMessage },
        });
        await this.syncPlanProgress(task.planId);
        await this.advancePlan(task.planId);
        if (task.goalId) {
          await this.insights.generateForGoal(task.goalId);
        }
        return;
      }

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
      await this.syncPlanProgress(task.planId);
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
        await this.reconcileStuckSteps(plan.id);
        await this.retryFixableFailedSteps(plan.id);
        await this.syncPlanProgress(plan.id);
        await this.advancePlan(plan.id);
      } catch (error) {
        this.logger.warn(`Plan sync failed ${plan.id}: ${error}`);
      }
    }
  }

  /** Repara pasos que quedaron RUNNING con tarea ya finalizada (regresión enqueueStep). */
  private async reconcileStuckSteps(planId: string) {
    const stuckSteps = await this.prisma.executionPlanStep.findMany({
      where: {
        planId,
        status: {
          in: [PlanStepStatus.RUNNING, PlanStepStatus.QUEUED],
        },
      },
      select: { id: true },
    });
    if (stuckSteps.length === 0) return;

    const tasks = await this.prisma.aiTask.findMany({
      where: {
        planId,
        planStepId: { in: stuckSteps.map((s) => s.id) },
        status: {
          in: [
            AiTaskStatus.COMPLETED,
            AiTaskStatus.FAILED,
            AiTaskStatus.AWAITING_APPROVAL,
          ],
        },
      },
      include: { execution: true },
    });

    for (const task of tasks) {
      if (!task.planStepId) continue;
      const cost = Number(task.execution?.totalCostUsd ?? 0);
      const stepStatus =
        task.status === AiTaskStatus.FAILED
          ? PlanStepStatus.FAILED
          : task.status === AiTaskStatus.AWAITING_APPROVAL
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
    }
  }

  /** Reintenta pasos de código que fallaron por bugs de input (ej. calculate_score sin leadId). */
  private async retryFixableFailedSteps(planId: string) {
    const retryableTaskKeys = [
      'leads.calculate_score',
      'leads.generate_demo',
      'leads.generate_prospect_bundle',
      'leads.run_prospect_pipeline',
    ];
    const failedSteps = await this.prisma.executionPlanStep.findMany({
      where: {
        planId,
        status: PlanStepStatus.FAILED,
        taskKey: { in: retryableTaskKeys },
      },
    });

    for (const step of failedSteps) {
      const latestTask = await this.prisma.aiTask.findUnique({
        where: { planStepId: step.id },
      });
      if (
        latestTask?.status === AiTaskStatus.COMPLETED ||
        latestTask?.status === AiTaskStatus.AWAITING_APPROVAL ||
        latestTask?.status === AiTaskStatus.RUNNING ||
        latestTask?.status === AiTaskStatus.PENDING
      ) {
        continue;
      }

      await this.prisma.executionPlanStep.update({
        where: { id: step.id },
        data: {
          status: PlanStepStatus.PENDING,
          output: Prisma.JsonNull,
          actualCostUsd: 0,
        },
      });
      this.logger.log(
        `Retrying fixable failed step ${step.taskKey} (${step.id})`,
      );
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

    const currentStep = await this.prisma.executionPlanStep.findUnique({
      where: { id: step.id },
      select: { status: true },
    });
    if (
      currentStep?.status === PlanStepStatus.COMPLETED ||
      currentStep?.status === PlanStepStatus.WAITING_APPROVAL ||
      currentStep?.status === PlanStepStatus.SKIPPED
    ) {
      return;
    }

    const existingTask = await this.prisma.aiTask.findUnique({
      where: { planStepId: step.id },
    });

    if (
      existingTask &&
      (existingTask.status === AiTaskStatus.PENDING ||
        existingTask.status === AiTaskStatus.RUNNING)
    ) {
      return;
    }

    if (
      existingTask?.status === AiTaskStatus.AWAITING_APPROVAL ||
      existingTask?.status === AiTaskStatus.COMPLETED
    ) {
      await this.prisma.executionPlanStep.update({
        where: { id: step.id },
        data: {
          status:
            existingTask.status === AiTaskStatus.AWAITING_APPROVAL
              ? PlanStepStatus.WAITING_APPROVAL
              : PlanStepStatus.COMPLETED,
          output: existingTask.output as Prisma.InputJsonValue,
        },
      });
      return;
    }

    let taskId: string;

    if (existingTask) {
      taskId = existingTask.id;
      await this.prisma.aiTask.update({
        where: { id: existingTask.id },
        data: {
          status: AiTaskStatus.PENDING,
          error: Prisma.JsonNull,
          output: Prisma.JsonNull,
          startedAt: null,
          completedAt: null,
          executionId: null,
          retryCount: { increment: 1 },
          input: (step.input ?? {}) as Prisma.InputJsonValue,
          selectedModel: step.selectedModel ?? undefined,
        },
      });
    } else {
      const created = await this.prisma.aiTask.create({
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
      taskId = created.id;

      await this.timeline.record({
        goalId: plan.goalId,
        planId,
        stepId: step.id,
        taskId,
        eventType: PlannerEventType.STEP_CREATED,
        title: `Tarea encolada: ${cap.label}`,
      });

      if (step.selectedModel) {
        await this.timeline.record({
          goalId: plan.goalId,
          planId,
          stepId: step.id,
          taskId,
          eventType: PlannerEventType.MODEL_SELECTED,
          title: `Modelo seleccionado: ${step.selectedModel}`,
          detail: { model: step.selectedModel },
        });
      }
    }

    await this.prisma.executionPlanStep.update({
      where: { id: step.id },
      data: { status: PlanStepStatus.RUNNING },
    });

    await this.timeline.record({
      goalId: plan.goalId,
      planId,
      stepId: step.id,
      taskId,
      eventType: PlannerEventType.STEP_STARTED,
      title: existingTask
        ? `Reintentando: ${cap.label}`
        : `Ejecutando: ${cap.label}`,
    });

    await this.runner.runTask(taskId);
  }

  async syncPlanProgressPublic(planId: string) {
    return this.syncPlanProgress(planId);
  }

  private static readonly TERMINAL_STEP_STATUSES: PlanStepStatus[] = [
    PlanStepStatus.COMPLETED,
    PlanStepStatus.SKIPPED,
    PlanStepStatus.FAILED,
    PlanStepStatus.WAITING_APPROVAL,
  ];

  private isStepProgressDone(status: PlanStepStatus) {
    return PlanExecutorService.TERMINAL_STEP_STATUSES.includes(status);
  }

  private async syncPlanProgress(planId: string) {
    const [steps, plan] = await Promise.all([
      this.prisma.executionPlanStep.findMany({ where: { planId } }),
      this.prisma.executionPlan.findUnique({ where: { id: planId } }),
    ]);
    if (!plan) return;

    const done = steps.filter((s) => this.isStepProgressDone(s.status)).length;
    const progress = steps.length > 0 ? (done / steps.length) * 100 : 0;

    const actualCost = steps.reduce(
      (s, step) => s + Number(step.actualCostUsd ?? 0),
      0,
    );

    const allDone = steps.every(
      (s) =>
        s.status === PlanStepStatus.COMPLETED ||
        s.status === PlanStepStatus.SKIPPED ||
        s.status === PlanStepStatus.FAILED,
    );
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
