import { Injectable } from '@nestjs/common';
import { PlannerEventType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlannerTimelineService {
  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    goalId?: string;
    planId?: string;
    stepId?: string;
    taskId?: string;
    eventType: PlannerEventType;
    title: string;
    detail?: Record<string, unknown>;
    costUsd?: number;
  }) {
    return this.prisma.aiPlannerEvent.create({
      data: {
        goalId: params.goalId,
        planId: params.planId,
        stepId: params.stepId,
        taskId: params.taskId,
        eventType: params.eventType,
        title: params.title,
        detail: params.detail as object | undefined,
        costUsd: params.costUsd,
      },
    });
  }

  async getTimeline(goalId: string, limit = 100) {
    return this.prisma.aiPlannerEvent.findMany({
      where: { goalId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async getPlanTimeline(planId: string, limit = 100) {
    return this.prisma.aiPlannerEvent.findMany({
      where: { planId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }
}
