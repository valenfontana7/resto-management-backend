import { Injectable } from '@nestjs/common';
import { LeadStatus, Prisma } from '@prisma/client';
import { getTaskCapability } from '../../ai-platform/planner/task-capabilities.registry';
import { PrismaService } from '../../prisma/prisma.service';
import { ExpectedValueEngineService } from './expected-value-engine.service';
import { CommercialConfigService } from '../config/commercial-config.service';
import type {
  ActionIntelligenceResult,
  CommercialAutonomyLevel,
  TodayDashboardDto,
} from '../types/commercial-intelligence.types';

@Injectable()
export class CommercialTodayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evEngine: ExpectedValueEngineService,
    private readonly config: CommercialConfigService,
  ) {}

  async getTodayDashboard(): Promise<TodayDashboardDto> {
    const [cfg, budget, leads] = await Promise.all([
      this.config.getActive(),
      this.prisma.aiCostBudget.findUnique({ where: { scope: 'global' } }),
      this.prisma.lead.findMany({
        where: {
          status: {
            notIn: [LeadStatus.CLIENT, LeadStatus.LOST],
          },
        },
        orderBy: [{ score: 'desc' }, { updatedAt: 'desc' }],
        take: 40,
      }),
    ]);

    let budgetRemainingUsd: number | null = null;
    const monthlyLimit = budget?.monthlyLimitUsd
      ? Number(budget.monthlyLimitUsd)
      : null;

    if (monthlyLimit != null) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const spent = await this.prisma.aiTaskExecution.aggregate({
        where: { executedAt: { gte: startOfMonth }, success: true },
        _sum: { totalCostUsd: true },
      });
      budgetRemainingUsd = monthlyLimit - Number(spent._sum.totalCostUsd ?? 0);
    }

    const evaluations: ActionIntelligenceResult[] = [];
    for (const lead of leads) {
      const primary = await this.evEngine.evaluateLead(
        lead,
        budgetRemainingUsd,
      );
      evaluations.push(primary);
    }

    evaluations.sort((a, b) => b.priority - a.priority);

    const recommended = evaluations.filter(
      (e) =>
        e.verdict === 'DO_NOW' ||
        e.verdict === 'GENERATE_DEMO' ||
        e.verdict === 'USE_FLASH',
    );

    const discarded = evaluations.filter(
      (e) =>
        e.verdict === 'NO_ACTION' ||
        e.verdict === 'SKIP_BUDGET' ||
        e.verdict === 'SKIP_DEMO',
    );

    const topImpact = [...evaluations]
      .sort((a, b) => b.expectedValueUsd - a.expectedValueUsd)
      .slice(0, 5);

    const totalExpectedValueUsd = recommended.reduce(
      (s, e) => s + Math.max(0, e.expectedValueUsd),
      0,
    );
    const totalExpectedCostUsd = recommended.reduce(
      (s, e) => s + e.estimatedCostUsd,
      0,
    );

    return {
      summary: {
        opportunitiesEvaluated: evaluations.length,
        recommendedCount: recommended.length,
        discardedCount: discarded.length,
        budgetRemainingUsd,
        budgetMonthlyLimitUsd: monthlyLimit,
        totalExpectedValueUsd,
        totalExpectedCostUsd,
        aggregateExpectedRoi:
          totalExpectedCostUsd > 0
            ? totalExpectedValueUsd / totalExpectedCostUsd
            : null,
      },
      recommended: recommended.slice(0, 8),
      discarded: discarded.slice(0, 5),
      topImpact,
      configVersion: cfg.version,
    };
  }

  async previewLead(leadId: string): Promise<{
    primary: ActionIntelligenceResult;
    alternatives: ActionIntelligenceResult[];
  }> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const budget = await this.prisma.aiCostBudget.findUnique({
      where: { scope: 'global' },
    });
    let budgetRemainingUsd: number | null = null;
    if (budget?.monthlyLimitUsd) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      const spent = await this.prisma.aiTaskExecution.aggregate({
        where: { executedAt: { gte: startOfMonth }, success: true },
        _sum: { totalCostUsd: true },
      });
      budgetRemainingUsd =
        Number(budget.monthlyLimitUsd) - Number(spent._sum.totalCostUsd ?? 0);
    }

    const primary = await this.evEngine.evaluateLead(lead, budgetRemainingUsd);
    const alternatives = await this.evEngine.evaluateAlternatives(
      lead,
      primary,
      budgetRemainingUsd,
    );

    return { primary, alternatives };
  }

  async simulateModels(
    leadId: string,
    taskKey: string,
  ): Promise<{
    scenarios: Array<{
      label: string;
      model: string;
      costUsd: number;
      expectedValueUsd: number;
      expectedRoi: number | null;
    }>;
    recommendation: string;
    reason: string;
  }> {
    const { primary } = await this.previewLead(leadId);
    const cap = getTaskCapability(taskKey);

    const models = [
      ...new Set([...cap.preferredModels, ...cap.budgetModels]),
    ].slice(0, 3);

    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const scenarios: Array<{
      label: string;
      model: string;
      costUsd: number;
      expectedValueUsd: number;
      expectedRoi: number | null;
    }> = [];

    for (const model of models) {
      const evalResult = await this.evEngine.evaluateLead(
        lead,
        null,
        {
          actionType: primary.actionType,
          taskKey,
          label: primary.label,
        },
        model,
      );
      scenarios.push({
        label: model.includes('lite')
          ? 'Flash Lite'
          : model.includes('pro')
            ? 'Pro'
            : 'Flash',
        model,
        costUsd: evalResult.estimatedCostUsd,
        expectedValueUsd: evalResult.expectedValueUsd,
        expectedRoi: evalResult.expectedRoi,
      });
    }

    scenarios.sort((a, b) => b.expectedValueUsd - a.expectedValueUsd);
    const best = scenarios[0];
    const expensive =
      scenarios.find((s) => s.label === 'Pro') ??
      scenarios[scenarios.length - 1];

    return {
      scenarios,
      recommendation: best?.label ?? 'Flash Lite',
      reason:
        best && expensive && best.model !== expensive.model
          ? `${best.label} ofrece mejor ROI (EV USD ${best.expectedValueUsd.toFixed(2)} vs USD ${expensive.expectedValueUsd.toFixed(2)} con ${expensive.label}).`
          : `Modelo recomendado: ${best?.label ?? 'default'}.`,
    };
  }
}

@Injectable()
export class CommercialDecisionService {
  constructor(private readonly prisma: PrismaService) {}

  async recordAccepted(
    result: ActionIntelligenceResult,
    userId?: string,
    goalId?: string,
    autonomyLevel?: CommercialAutonomyLevel,
    executedPlanId?: string,
  ) {
    return this.prisma.commercialDecision.create({
      data: {
        decisionType: 'ACTION_ACCEPTED',
        actionType: result.actionType,
        targetType: result.targetType,
        targetId: result.targetId,
        recommendedAction: result as unknown as Prisma.InputJsonValue,
        chosenAction: result as unknown as Prisma.InputJsonValue,
        expectedCostUsd: result.estimatedCostUsd,
        expectedValueUsd: result.expectedValueUsd,
        expectedRoi: result.expectedRoi,
        confidence: result.confidence,
        reason: result.reason,
        goalId,
        executedPlanId,
        autonomyLevel: autonomyLevel ?? 'SUGGEST_GOAL',
        outcomeStatus: 'pending',
        createdById: userId,
      },
    });
  }

  async updateOutcome(
    decisionId: string,
    data: {
      actualCostUsd?: number;
      outcomeStatus: string;
    },
  ) {
    return this.prisma.commercialDecision.update({
      where: { id: decisionId },
      data: {
        actualCostUsd: data.actualCostUsd,
        outcomeStatus: data.outcomeStatus,
        outcomeAt: new Date(),
      },
    });
  }

  async syncOutcomeForGoal(goalId: string, outcomeStatus: string) {
    const decision = await this.prisma.commercialDecision.findFirst({
      where: { goalId },
      orderBy: { createdAt: 'desc' },
    });
    if (!decision) return null;

    const actualCostUsd = await this.aggregateGoalCost(goalId);
    return this.updateOutcome(decision.id, { actualCostUsd, outcomeStatus });
  }

  private async aggregateGoalCost(goalId: string): Promise<number | undefined> {
    const spent = await this.prisma.aiTaskExecution.aggregate({
      where: {
        success: true,
        task: { goalId },
      },
      _sum: { totalCostUsd: true },
    });
    const total = Number(spent._sum?.totalCostUsd ?? 0);
    return total > 0 ? total : undefined;
  }

  listRecent(limit = 20) {
    return this.prisma.commercialDecision.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  findLatestForLead(leadId: string) {
    return this.prisma.commercialDecision.findFirst({
      where: { targetType: 'lead', targetId: leadId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
