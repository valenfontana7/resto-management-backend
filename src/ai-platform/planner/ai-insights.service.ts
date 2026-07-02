import { Injectable } from '@nestjs/common';
import { AiInsightCategory } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { RoiMetrics } from '../types/planner.types';

@Injectable()
export class RoiCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  async calculateForGoal(goalId: string): Promise<RoiMetrics> {
    const [executions, goal] = await Promise.all([
      this.prisma.aiTaskExecution.findMany({
        where: {
          success: true,
          task: { goalId },
        },
      }),
      this.prisma.aiGoal.findUnique({ where: { id: goalId } }),
    ]);

    const totalSpent = executions.reduce(
      (sum, e) => sum + Number(e.totalCostUsd),
      0,
    );
    const cacheSavings = executions
      .filter((e) => e.cacheHit)
      .reduce((sum, e) => sum + Number(e.cacheSavedUsd ?? 0), 0);

    const byPrefix = (prefix: string) =>
      this.avgCost(executions.filter((e) => e.taskKey.startsWith(prefix)));

    const achieved = goal?.achievedCount ?? 0;
    const actualRoi =
      achieved > 0 && totalSpent > 0 ? achieved / totalSpent : null;

    return {
      costPerLead: this.avgCost(executions.filter((e) => e.leadId != null)),
      costPerMessage: byPrefix('leads.draft_message'),
      costPerDemo: this.avgCost(
        executions.filter((e) => e.taskKey === 'leads.generate_demo'),
      ),
      costPerResponse: this.avgCost(
        executions.filter((e) => e.taskKey === 'leads.analyze_client_reply'),
      ),
      costPerMeeting: null,
      cacheSavingsUsd: cacheSavings,
      reuseSavingsUsd: cacheSavings,
      estimatedRoi: goal?.estimatedRoi ?? null,
      actualRoi,
    };
  }

  private avgCost(rows: Array<{ totalCostUsd: unknown }>): number | null {
    if (rows.length === 0) return null;
    const sum = rows.reduce((s, r) => s + Number(r.totalCostUsd), 0);
    return sum / rows.length;
  }
}

@Injectable()
export class AiInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roi: RoiCalculatorService,
  ) {}

  async generateGlobalInsights(): Promise<void> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const executions = await this.prisma.aiTaskExecution.findMany({
      where: { executedAt: { gte: thirtyDaysAgo }, success: true },
    });

    if (executions.length === 0) return;

    const totalCost = executions.reduce(
      (s, e) => s + Number(e.totalCostUsd),
      0,
    );
    const byTask = new Map<string, number>();
    const byModel = new Map<string, number>();

    for (const e of executions) {
      byTask.set(
        e.taskKey,
        (byTask.get(e.taskKey) ?? 0) + Number(e.totalCostUsd),
      );
      if (e.model) {
        byModel.set(
          e.model,
          (byModel.get(e.model) ?? 0) + Number(e.totalCostUsd),
        );
      }
    }

    const topTask = [...byTask.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topTask && totalCost > 0) {
      const pct = Math.round((topTask[1] / totalCost) * 100);
      await this.persistInsight({
        category: AiInsightCategory.COST,
        title: 'Distribución de costos por tarea',
        body: `Los ${topTask[0].replace('leads.', '')} consumen el ${pct}% del presupuesto de IA en los últimos 30 días.`,
        metricKey: 'top_task_cost_share',
        metricValue: pct,
        impactUsd: topTask[1],
      });
    }

    const flashLiteCost = byModel.get('gemini-2.5-flash-lite') ?? 0;
    const flashCost = byModel.get('gemini-2.5-flash') ?? 0;
    if (flashCost > 0 && flashLiteCost > 0) {
      const savings = flashCost * 0.4;
      await this.persistInsight({
        category: AiInsightCategory.EFFICIENCY,
        title: 'Oportunidad de ahorro con Flash Lite',
        body: `Usar gemini-2.5-flash-lite en tareas compatibles hubiera ahorrado aproximadamente USD ${savings.toFixed(2)} en el periodo analizado.`,
        metricKey: 'flash_lite_savings',
        metricValue: savings,
        impactUsd: savings,
      });
    }

    const budget = await this.prisma.aiCostBudget.findUnique({
      where: { scope: 'global' },
    });
    if (budget?.monthlyLimitUsd && totalCost > 0) {
      const remaining = Number(budget.monthlyLimitUsd) - totalCost;
      const avgPerLead =
        executions.filter((e) => e.leadId).length > 0
          ? totalCost /
            new Set(executions.map((e) => e.leadId).filter(Boolean)).size
          : 0.005;
      const moreLeads = avgPerLead > 0 ? Math.floor(remaining / avgPerLead) : 0;
      if (moreLeads > 0) {
        await this.persistInsight({
          category: AiInsightCategory.BUDGET,
          title: 'Capacidad restante del presupuesto',
          body: `El presupuesto mensual alcanza para aproximadamente ${moreLeads} restaurantes más al costo promedio actual.`,
          metricKey: 'remaining_capacity',
          metricValue: moreLeads,
        });
      }
    }
  }

  async generateForGoal(goalId: string) {
    const roi = await this.roi.calculateForGoal(goalId);
    if (roi.cacheSavingsUsd > 0) {
      await this.persistInsight({
        goalId,
        category: AiInsightCategory.EFFICIENCY,
        title: 'Ahorro por reutilización',
        body: `Este objetivo ahorró USD ${roi.cacheSavingsUsd.toFixed(4)} reutilizando resultados previos.`,
        metricKey: 'cache_savings',
        metricValue: roi.cacheSavingsUsd,
        impactUsd: roi.cacheSavingsUsd,
      });
    }
  }

  listInsights(goalId?: string, limit = 20) {
    return this.prisma.aiInsight.findMany({
      where: goalId ? { goalId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  private async persistInsight(data: {
    goalId?: string;
    category: AiInsightCategory;
    title: string;
    body: string;
    metricKey?: string;
    metricValue?: number;
    impactUsd?: number;
  }) {
    const existing = await this.prisma.aiInsight.findFirst({
      where: {
        goalId: data.goalId ?? null,
        metricKey: data.metricKey,
        createdAt: { gte: new Date(Date.now() - 86400 * 1000) },
      },
    });
    if (existing) return existing;

    return this.prisma.aiInsight.create({ data });
  }
}
