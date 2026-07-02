import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AiGoalStatus,
  ExecutionPlanStatus,
  PlanStepStatus,
  PlannerEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GoalEngineService } from '../goal-engine/goal-engine.service';
import { UpdatePlanDto } from '../dto/ai-goal.dto';
import { AiInsightsService } from './ai-insights.service';
import { PlanComposerService } from './plan-composer.service';
import { PlannerTimelineService } from './planner-timeline.service';
import type { ComposedPlanStep } from '../types/planner.types';

@Injectable()
export class AiPlannerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalEngine: GoalEngineService,
    private readonly composer: PlanComposerService,
    private readonly timeline: PlannerTimelineService,
    private readonly insights: AiInsightsService,
  ) {}

  async buildPlan(goalId: string, userId?: string) {
    void userId;
    const goal = await this.goalEngine.get(goalId);

    await this.prisma.aiGoal.update({
      where: { id: goalId },
      data: { status: AiGoalStatus.PLANNING },
    });

    const context = this.goalEngine.buildPlanningContext(goal);
    const { steps, summary } = await this.composer.compose(context);

    const plan = await this.prisma.executionPlan.create({
      data: {
        goalId,
        status: ExecutionPlanStatus.PENDING_APPROVAL,
        summary: summary as unknown as Prisma.InputJsonValue,
        estimatedCostUsd: summary.estimatedCostUsd,
        estimatedDurationMs: summary.estimatedDurationMs,
        estimatedConfidence: summary.estimatedConfidence,
        risks: summary.risks as unknown as Prisma.InputJsonValue,
        steps: {
          create: this.mapStepsToCreate(steps),
        },
      },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });

    const stepKeyToId = new Map(plan.steps.map((s) => [s.stepKey, s.id]));
    for (const step of plan.steps) {
      const deps = (step.dependsOnStepIds as string[]) ?? [];
      const resolvedDeps = deps.map((d) => stepKeyToId.get(d) ?? d);
      const needsUpdate = deps.some((d, i) => resolvedDeps[i] !== d);
      if (needsUpdate) {
        await this.prisma.executionPlanStep.update({
          where: { id: step.id },
          data: { dependsOnStepIds: resolvedDeps },
        });
      }
    }

    await this.prisma.aiGoal.update({
      where: { id: goalId },
      data: {
        status: AiGoalStatus.PLANNED,
        estimatedCostUsd: summary.estimatedCostUsd,
        estimatedDurationMs: summary.estimatedDurationMs,
        estimatedRoi: summary.estimatedConfidence,
      },
    });

    await this.timeline.record({
      goalId,
      planId: plan.id,
      eventType: PlannerEventType.PLAN_BUILT,
      title: 'Plan de ejecución construido',
      detail: summary as unknown as Record<string, unknown>,
      costUsd: summary.estimatedCostUsd,
    });

    return this.getPlan(plan.id);
  }

  async getPlan(planId: string) {
    const plan = await this.prisma.executionPlan.findUnique({
      where: { id: planId },
      include: {
        steps: { orderBy: { sortOrder: 'asc' } },
        goal: true,
      },
    });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  async updatePlan(planId: string, dto: UpdatePlanDto) {
    const plan = await this.getPlan(planId);
    if (plan.status !== ExecutionPlanStatus.PENDING_APPROVAL) {
      throw new BadRequestException(
        'Solo planes pendientes de aprobación pueden editarse',
      );
    }

    if (dto.steps) {
      for (const change of dto.steps) {
        if (change.removed) {
          await this.prisma.executionPlanStep.delete({
            where: { id: change.stepId },
          });
          continue;
        }
        await this.prisma.executionPlanStep.update({
          where: { id: change.stepId },
          data: {
            priority: change.priority,
            selectedModel: change.selectedModel,
            label: change.label,
          },
        });
      }
    }

    return this.recalculatePlanEstimates(planId);
  }

  async approvePlan(planId: string, userId?: string) {
    const plan = await this.getPlan(planId);
    const updated = await this.prisma.executionPlan.update({
      where: { id: planId },
      data: {
        status: ExecutionPlanStatus.APPROVED,
        approvedById: userId,
        approvedAt: new Date(),
      },
    });

    await this.timeline.record({
      goalId: plan.goalId,
      planId,
      eventType: PlannerEventType.PLAN_APPROVED,
      title: 'Plan aprobado por el usuario',
    });

    return updated;
  }

  private mapStepsToCreate(steps: ComposedPlanStep[]) {
    return steps.map((step, index) => ({
      stepKey: step.stepKey,
      taskKey: step.taskKey,
      label: step.label,
      status: step.skipReason ? PlanStepStatus.SKIPPED : PlanStepStatus.PENDING,
      priority: step.priority,
      dependsOnStepIds: step.dependsOnStepIds,
      input: step.input as Prisma.InputJsonValue,
      selectedModel: step.selectedModel,
      estimatedCostUsd: step.estimatedCostUsd,
      estimatedDurationMs: step.estimatedDurationMs,
      skipReason: step.skipReason,
      reuseFromStepId: step.reuseFromStepId,
      entityRef: step.entityRef,
      sortOrder: index,
    }));
  }

  private async recalculatePlanEstimates(planId: string) {
    const steps = await this.prisma.executionPlanStep.findMany({
      where: { planId, status: { not: PlanStepStatus.SKIPPED } },
    });
    const cost = steps.reduce(
      (s, step) => s + Number(step.estimatedCostUsd ?? 0),
      0,
    );
    const duration = steps.reduce(
      (s, step) => s + (step.estimatedDurationMs ?? 0),
      0,
    );
    return this.prisma.executionPlan.update({
      where: { id: planId },
      data: { estimatedCostUsd: cost, estimatedDurationMs: duration },
      include: { steps: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}
