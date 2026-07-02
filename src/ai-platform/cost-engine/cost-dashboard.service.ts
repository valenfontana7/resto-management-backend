import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CostDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      budget,
      dailySpend,
      monthlySpend,
      avgCostPerLead,
      avgCostPerMessage,
      avgCostPerDemo,
      topTasks,
      byProvider,
      byModel,
      cacheSavings,
      timeline,
      recentExecutions,
      totalLeadsWithCost,
      totalMessages,
      totalDemos,
    ] = await Promise.all([
      this.prisma.aiCostBudget.findUnique({ where: { scope: 'global' } }),
      this.sumSince(startOfDay),
      this.sumSince(startOfMonth),
      this.avgCostByTaskPrefix('leads.draft_message'),
      this.avgCostByTaskKey('leads.generate_demo'),
      this.avgCostByTaskKey('leads.generate_demo'),
      this.topCostlyTasks(thirtyDaysAgo),
      this.groupByProvider(thirtyDaysAgo),
      this.groupByModel(thirtyDaysAgo),
      this.cacheSavingsSince(thirtyDaysAgo),
      this.timelineSince(thirtyDaysAgo),
      this.recentExecutions(50),
      this.countDistinctLeads(thirtyDaysAgo),
      this.countExecutions(thirtyDaysAgo, 'leads.draft_message'),
      this.countExecutions(thirtyDaysAgo, 'leads.generate_demo'),
    ]);

    return {
      budget: {
        dailyLimitUsd: budget?.dailyLimitUsd
          ? Number(budget.dailyLimitUsd)
          : null,
        monthlyLimitUsd: budget?.monthlyLimitUsd
          ? Number(budget.monthlyLimitUsd)
          : null,
        hardStop: budget?.hardStop ?? false,
      },
      consumption: {
        dailyUsd: dailySpend,
        monthlyUsd: monthlySpend,
        dailyPercent: budget?.dailyLimitUsd
          ? (dailySpend / Number(budget.dailyLimitUsd)) * 100
          : null,
        monthlyPercent: budget?.monthlyLimitUsd
          ? (monthlySpend / Number(budget.monthlyLimitUsd)) * 100
          : null,
      },
      averages: {
        costPerLead: avgCostPerLead,
        costPerMessage: avgCostPerMessage,
        costPerDemo: avgCostPerDemo,
      },
      topCostlyTasks: topTasks,
      distribution: {
        byProvider,
        byModel,
      },
      cacheSavingsUsd: cacheSavings,
      timeline,
      recentExecutions,
      counts: {
        leadsWithCost: totalLeadsWithCost,
        messages: totalMessages,
        demos: totalDemos,
      },
    };
  }

  async listExecutions(params: {
    limit?: number;
    offset?: number;
    taskKey?: string;
    leadId?: string;
    savedSearchId?: string;
  }) {
    const where: Prisma.AiTaskExecutionWhereInput = {};
    if (params.taskKey) where.taskKey = params.taskKey;
    if (params.leadId) where.leadId = params.leadId;
    if (params.savedSearchId) where.savedSearchId = params.savedSearchId;

    const [items, total] = await Promise.all([
      this.prisma.aiTaskExecution.findMany({
        where,
        orderBy: { executedAt: 'desc' },
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
      }),
      this.prisma.aiTaskExecution.count({ where }),
    ]);

    return {
      items: items.map((e) => this.serializeExecution(e)),
      total,
    };
  }

  async getCostByLead(leadId: string) {
    const result = await this.prisma.aiTaskExecution.aggregate({
      where: { leadId, success: true },
      _sum: { totalCostUsd: true },
      _count: true,
    });

    const byTask = await this.prisma.aiTaskExecution.groupBy({
      by: ['taskKey'],
      where: { leadId, success: true },
      _sum: { totalCostUsd: true },
      _count: true,
    });

    return {
      leadId,
      totalCostUsd: Number(result._sum.totalCostUsd ?? 0),
      executionCount: result._count,
      byTask: byTask.map((row) => ({
        taskKey: row.taskKey,
        costUsd: Number(row._sum.totalCostUsd ?? 0),
        count: row._count,
      })),
    };
  }

  async getCostByCampaign(savedSearchId: string) {
    const result = await this.prisma.aiTaskExecution.aggregate({
      where: { savedSearchId, success: true },
      _sum: { totalCostUsd: true },
      _count: true,
    });

    return {
      savedSearchId,
      totalCostUsd: Number(result._sum.totalCostUsd ?? 0),
      executionCount: result._count,
    };
  }

  async getSummary() {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);

    const [dailySpend, executionCount] = await Promise.all([
      this.sumSince(startOfDay),
      this.prisma.aiTaskExecution.count({
        where: { executedAt: { gte: startOfDay } },
      }),
    ]);

    return { dailySpendUsd: dailySpend, executionCountToday: executionCount };
  }

  private async sumSince(since: Date): Promise<number> {
    const result = await this.prisma.aiTaskExecution.aggregate({
      where: { executedAt: { gte: since }, success: true },
      _sum: { totalCostUsd: true },
    });
    return Number(result._sum.totalCostUsd ?? 0);
  }

  private async avgCostByTaskPrefix(prefix: string): Promise<number | null> {
    const result = await this.prisma.aiTaskExecution.aggregate({
      where: {
        taskKey: { startsWith: prefix },
        success: true,
      },
      _avg: { totalCostUsd: true },
      _count: true,
    });
    if (result._count === 0) return null;
    return Number(result._avg.totalCostUsd ?? 0);
  }

  private async avgCostByTaskKey(taskKey: string): Promise<number | null> {
    const result = await this.prisma.aiTaskExecution.aggregate({
      where: { taskKey, success: true },
      _avg: { totalCostUsd: true },
      _count: true,
    });
    if (result._count === 0) return null;
    return Number(result._avg.totalCostUsd ?? 0);
  }

  private async topCostlyTasks(since: Date) {
    const rows = await this.prisma.aiTaskExecution.groupBy({
      by: ['taskKey'],
      where: { executedAt: { gte: since }, success: true },
      _sum: { totalCostUsd: true },
      _count: true,
      orderBy: { _sum: { totalCostUsd: 'desc' } },
      take: 10,
    });

    return rows.map((row) => ({
      taskKey: row.taskKey,
      totalCostUsd: Number(row._sum.totalCostUsd ?? 0),
      count: row._count,
    }));
  }

  private async groupByProvider(since: Date) {
    const rows = await this.prisma.aiTaskExecution.groupBy({
      by: ['provider'],
      where: { executedAt: { gte: since }, success: true },
      _sum: { totalCostUsd: true },
    });

    return rows.map((row) => ({
      provider: row.provider,
      totalCostUsd: Number(row._sum.totalCostUsd ?? 0),
    }));
  }

  private async groupByModel(since: Date) {
    const rows = await this.prisma.aiTaskExecution.groupBy({
      by: ['model'],
      where: { executedAt: { gte: since }, success: true },
      _sum: { totalCostUsd: true },
    });

    return rows.map((row) => ({
      model: row.model,
      totalCostUsd: Number(row._sum.totalCostUsd ?? 0),
    }));
  }

  private async cacheSavingsSince(since: Date): Promise<number> {
    const result = await this.prisma.aiTaskExecution.aggregate({
      where: { executedAt: { gte: since }, cacheHit: true },
      _sum: { cacheSavedUsd: true },
    });
    return Number(result._sum.cacheSavedUsd ?? 0);
  }

  private async timelineSince(since: Date) {
    const rows = await this.prisma.$queryRaw<
      Array<{ day: Date; total: Prisma.Decimal; count: bigint }>
    >`
      SELECT DATE_TRUNC('day', "executedAt") AS day,
             SUM("totalCostUsd") AS total,
             COUNT(*) AS count
      FROM "AiTaskExecution"
      WHERE "executedAt" >= ${since} AND "success" = true
      GROUP BY DATE_TRUNC('day', "executedAt")
      ORDER BY day ASC
    `;

    return rows.map((row) => ({
      date: row.day.toISOString(),
      totalCostUsd: Number(row.total),
      count: Number(row.count),
    }));
  }

  private async recentExecutions(limit: number) {
    const items = await this.prisma.aiTaskExecution.findMany({
      orderBy: { executedAt: 'desc' },
      take: limit,
    });
    return items.map((e) => this.serializeExecution(e));
  }

  private async countDistinctLeads(since: Date): Promise<number> {
    const rows = await this.prisma.aiTaskExecution.findMany({
      where: { executedAt: { gte: since }, leadId: { not: null } },
      distinct: ['leadId'],
      select: { leadId: true },
    });
    return rows.length;
  }

  private async countExecutions(
    since: Date,
    taskKeyPrefix: string,
  ): Promise<number> {
    return this.prisma.aiTaskExecution.count({
      where: {
        executedAt: { gte: since },
        taskKey: { startsWith: taskKeyPrefix },
      },
    });
  }

  private serializeExecution(e: {
    id: string;
    taskKey: string;
    provider: string | null;
    model: string | null;
    promptTokens: number;
    completionTokens: number;
    reasoningTokens: number;
    inputCostUsd: Prisma.Decimal;
    outputCostUsd: Prisma.Decimal;
    totalCostUsd: Prisma.Decimal;
    durationMs: number;
    cacheHit: boolean;
    cacheSavedUsd: Prisma.Decimal | null;
    success: boolean;
    errorMessage: string | null;
    leadId: string | null;
    savedSearchId: string | null;
    userId: string | null;
    executedAt: Date;
  }) {
    return {
      id: e.id,
      taskKey: e.taskKey,
      provider: e.provider,
      model: e.model,
      promptTokens: e.promptTokens,
      completionTokens: e.completionTokens,
      reasoningTokens: e.reasoningTokens,
      inputCostUsd: Number(e.inputCostUsd),
      outputCostUsd: Number(e.outputCostUsd),
      totalCostUsd: Number(e.totalCostUsd),
      durationMs: e.durationMs,
      cacheHit: e.cacheHit,
      cacheSavedUsd: e.cacheSavedUsd ? Number(e.cacheSavedUsd) : null,
      success: e.success,
      errorMessage: e.errorMessage,
      leadId: e.leadId,
      savedSearchId: e.savedSearchId,
      userId: e.userId,
      executedAt: e.executedAt.toISOString(),
    };
  }
}
