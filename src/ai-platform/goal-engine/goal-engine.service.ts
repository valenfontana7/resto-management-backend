import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import {
  AiGoalStatus,
  ExecutionPlanStatus,
  PlannerEventType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  GoalConstraints,
  GoalFilters,
  GoalProgressMetrics,
  PlanningContext,
} from '../types/planner.types';
import { CreateGoalDto, UpdateGoalDto } from '../dto/ai-goal.dto';
import { GoalStrategyRegistry } from '../planner/goal-strategies';
import { PlannerTimelineService } from '../planner/planner-timeline.service';
import { RoiCalculatorService } from '../planner/ai-insights.service';

@Injectable()
export class GoalEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly strategies: GoalStrategyRegistry,
    private readonly timeline: PlannerTimelineService,
    private readonly roi: RoiCalculatorService,
  ) {}

  async create(dto: CreateGoalDto, userId?: string) {
    const filters = (dto.filters ?? {}) as GoalFilters;
    const goalType =
      dto.goalType ?? this.strategies.inferGoalType(dto.objective, filters);

    const goal = await this.prisma.aiGoal.create({
      data: {
        title: dto.title,
        objective: dto.objective,
        goalType,
        targetCount: dto.targetCount ?? 1,
        budgetUsd: dto.budgetUsd,
        filters: filters as Prisma.InputJsonValue,
        constraints: (dto.constraints ?? {}) as Prisma.InputJsonValue,
        priorities: (dto.priorities ?? {}) as Prisma.InputJsonValue,
        createdById: userId,
        status: AiGoalStatus.DRAFT,
      },
    });

    await this.timeline.record({
      goalId: goal.id,
      eventType: PlannerEventType.GOAL_CREATED,
      title: `Objetivo creado: ${goal.title}`,
      detail: { goalType, targetCount: goal.targetCount },
    });

    return goal;
  }

  async update(id: string, dto: UpdateGoalDto) {
    await this.ensureGoal(id);
    return this.prisma.aiGoal.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.objective && { objective: dto.objective }),
        ...(dto.targetCount != null && { targetCount: dto.targetCount }),
        ...(dto.budgetUsd != null && { budgetUsd: dto.budgetUsd }),
        ...(dto.filters && { filters: dto.filters as Prisma.InputJsonValue }),
        ...(dto.constraints && {
          constraints: dto.constraints as Prisma.InputJsonValue,
        }),
        ...(dto.priorities && {
          priorities: dto.priorities as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async pause(id: string) {
    const goal = await this.ensureGoal(id);
    if (goal.status !== AiGoalStatus.RUNNING) {
      throw new BadRequestException(
        'Solo objetivos en ejecución pueden pausarse',
      );
    }
    const updated = await this.prisma.aiGoal.update({
      where: { id },
      data: { status: AiGoalStatus.PAUSED, pausedAt: new Date() },
    });
    await this.timeline.record({
      goalId: id,
      eventType: PlannerEventType.GOAL_PAUSED,
      title: 'Objetivo pausado',
    });
    return updated;
  }

  async resume(id: string) {
    const goal = await this.ensureGoal(id);
    if (goal.status !== AiGoalStatus.PAUSED) {
      throw new BadRequestException(
        'Solo objetivos pausados pueden reanudarse',
      );
    }
    const updated = await this.prisma.aiGoal.update({
      where: { id },
      data: { status: AiGoalStatus.RUNNING, pausedAt: null },
    });
    await this.timeline.record({
      goalId: id,
      eventType: PlannerEventType.GOAL_RESUMED,
      title: 'Objetivo reanudado',
    });
    return updated;
  }

  async cancel(id: string) {
    await this.ensureGoal(id);
    const updated = await this.prisma.aiGoal.update({
      where: { id },
      data: {
        status: AiGoalStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });
    await this.prisma.executionPlan.updateMany({
      where: {
        goalId: id,
        status: { in: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'RUNNING'] },
      },
      data: { status: ExecutionPlanStatus.CANCELLED },
    });
    await this.timeline.record({
      goalId: id,
      eventType: PlannerEventType.GOAL_CANCELLED,
      title: 'Objetivo cancelado',
    });
    return updated;
  }

  async getProgress(id: string): Promise<GoalProgressMetrics> {
    const goal = await this.ensureGoal(id);
    const roiMetrics = await this.roi.calculateForGoal(id);

    const pendingCost = await this.prisma.executionPlanStep.aggregate({
      where: {
        plan: { goalId: id },
        status: {
          in: [
            'PENDING',
            'QUEUED',
            'WAITING_DEPENDENCY',
            'RUNNING',
            'WAITING_APPROVAL',
          ],
        },
      },
      _sum: { estimatedCostUsd: true },
    });

    const pendingDuration = await this.prisma.executionPlanStep.aggregate({
      where: {
        plan: { goalId: id },
        status: {
          in: [
            'PENDING',
            'QUEUED',
            'WAITING_DEPENDENCY',
            'RUNNING',
            'WAITING_APPROVAL',
          ],
        },
      },
      _sum: { estimatedDurationMs: true },
    });

    const latestPlan = await this.prisma.executionPlan.findFirst({
      where: { goalId: id },
      orderBy: { createdAt: 'desc' },
      select: { progressPercent: true },
    });

    const stepProgress = latestPlan?.progressPercent ?? goal.progressPercent;

    return {
      targetCount: goal.targetCount,
      achievedCount: goal.achievedCount,
      progressPercent: stepProgress,
      spentUsd: Number(goal.spentUsd),
      estimatedRemainingUsd: Number(pendingCost._sum.estimatedCostUsd ?? 0),
      estimatedRemainingMs: pendingDuration._sum.estimatedDurationMs ?? 0,
      actualRoi: roiMetrics.actualRoi,
      estimatedRoi: goal.estimatedRoi,
    };
  }

  buildPlanningContext(goal: {
    id: string;
    goalType: string;
    objective: string;
    targetCount: number;
    budgetUsd: Prisma.Decimal | null;
    filters: unknown;
    constraints: unknown;
    priorities: unknown;
  }): PlanningContext {
    return {
      goalId: goal.id,
      goalType: goal.goalType,
      objective: goal.objective,
      targetCount: goal.targetCount,
      budgetUsd: goal.budgetUsd ? Number(goal.budgetUsd) : undefined,
      filters: (goal.filters ?? {}) as GoalFilters,
      constraints: (goal.constraints ?? {}) as GoalConstraints,
      priorities: (goal.priorities ?? {}) as Record<string, number>,
    };
  }

  async list(userId?: string) {
    return this.prisma.aiGoal.findMany({
      where: userId ? { createdById: userId } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        plans: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async get(id: string) {
    const goal = await this.prisma.aiGoal.findUnique({
      where: { id },
      include: {
        plans: { orderBy: { createdAt: 'desc' }, include: { steps: true } },
        insights: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    if (!goal) throw new NotFoundException('Objetivo no encontrado');
    return goal;
  }

  private async ensureGoal(id: string) {
    const goal = await this.prisma.aiGoal.findUnique({ where: { id } });
    if (!goal) throw new NotFoundException('Objetivo no encontrado');
    return goal;
  }
}
