import { Injectable } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CommercialConfigService } from '../config/commercial-config.service';
import type {
  ActionIntelligenceResult,
  CommercialLearningSummaryDto,
  DecisionOutcomeComparison,
  DecisionOutcomeStatus,
} from '../types/commercial-intelligence.types';

const STATUS_RANK: Record<LeadStatus, number> = {
  NEW: 0,
  ANALYZED: 1,
  CONTACTED: 2,
  INTERESTED: 3,
  MEETING_SCHEDULED: 4,
  CLIENT: 5,
  LOST: -1,
};

const OUTCOME_LABELS: Record<DecisionOutcomeStatus, string> = {
  converted: 'Convertido a cliente',
  progressed: 'Avanzó en el pipeline',
  stalled: 'Sin avance',
  lost: 'Perdido',
  pending: 'En evaluación',
  unknown: 'Sin datos',
};

@Injectable()
export class CommercialLearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: CommercialConfigService,
  ) {}

  async getSummary(limit = 25): Promise<CommercialLearningSummaryDto> {
    const [decisions, cfg] = await Promise.all([
      this.prisma.commercialDecision.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      this.config.getActive(),
    ]);

    const baseDealValue = cfg.thresholds.baseDealValueUsd;
    const items: DecisionOutcomeComparison[] = [];

    for (const decision of decisions) {
      const expectedCostUsd = Number(decision.expectedCostUsd);
      const expectedValueUsd = Number(decision.expectedValueUsd);
      const expectedRoi = decision.expectedRoi;

      const actualCostUsd =
        decision.actualCostUsd != null
          ? Number(decision.actualCostUsd)
          : await this.resolveActualCost(
              decision.targetId,
              decision.goalId,
              decision.createdAt,
            );

      const lead =
        decision.targetType === 'lead' && decision.targetId
          ? await this.prisma.lead.findUnique({
              where: { id: decision.targetId },
              select: {
                id: true,
                businessName: true,
                status: true,
                updatedAt: true,
              },
            })
          : null;

      const outcomeStatus =
        decision.outcomeStatus &&
        this.isDecisionOutcomeStatus(decision.outcomeStatus)
          ? decision.outcomeStatus
          : await this.resolveOutcomeStatus(lead, decision.createdAt);

      const valueRealizedUsd =
        outcomeStatus === 'converted'
          ? (this.extractExpectedRevenue(decision.recommendedAction) ??
            baseDealValue)
          : outcomeStatus === 'progressed'
            ? baseDealValue * 0.15
            : 0;

      const costDeviationUsd =
        actualCostUsd != null ? actualCostUsd - expectedCostUsd : null;

      const actualRoi =
        actualCostUsd != null && actualCostUsd > 0
          ? (valueRealizedUsd - actualCostUsd) / actualCostUsd
          : null;

      const predictionAccuracy = this.computePredictionAccuracy({
        outcomeStatus,
        expectedValueUsd,
        expectedRoi,
        actualRoi,
        costDeviationUsd,
        expectedCostUsd,
      });

      items.push({
        decisionId: decision.id,
        actionType: decision.actionType,
        targetId: decision.targetId,
        leadName: lead?.businessName ?? null,
        goalId: decision.goalId,
        decidedAt: decision.createdAt.toISOString(),
        expectedCostUsd,
        expectedValueUsd,
        expectedRoi,
        actualCostUsd,
        costDeviationUsd,
        valueRealizedUsd,
        actualRoi,
        outcomeStatus,
        outcomeLabel: OUTCOME_LABELS[outcomeStatus],
        predictionAccuracy,
      });
    }

    const resolved = items.filter((i) => i.outcomeStatus !== 'pending');
    const withAccuracy = resolved.filter((i) => i.predictionAccuracy != null);

    return {
      summary: {
        decisionsAnalyzed: items.length,
        converted: items.filter((i) => i.outcomeStatus === 'converted').length,
        progressed: items.filter((i) => i.outcomeStatus === 'progressed')
          .length,
        stalled: items.filter((i) => i.outcomeStatus === 'stalled').length,
        lost: items.filter((i) => i.outcomeStatus === 'lost').length,
        pending: items.filter((i) => i.outcomeStatus === 'pending').length,
        avgCostDeviationUsd: this.average(
          items
            .map((i) => i.costDeviationUsd)
            .filter((v): v is number => v != null),
        ),
        avgExpectedRoi: this.average(
          items.map((i) => i.expectedRoi).filter((v): v is number => v != null),
        ),
        avgActualRoi: this.average(
          resolved
            .map((i) => i.actualRoi)
            .filter((v): v is number => v != null),
        ),
        predictionAccuracyAvg: this.average(
          withAccuracy
            .map((i) => i.predictionAccuracy)
            .filter((v): v is number => v != null),
        ),
      },
      items,
    };
  }

  private async resolveActualCost(
    targetId: string | null,
    goalId: string | null,
    since: Date,
  ): Promise<number | null> {
    const orFilters: Array<Record<string, unknown>> = [];
    if (targetId) orFilters.push({ leadId: targetId });
    if (goalId) orFilters.push({ task: { goalId } });

    if (orFilters.length === 0) return null;

    const spent = await this.prisma.aiTaskExecution.aggregate({
      where: {
        executedAt: { gte: since },
        success: true,
        OR: orFilters,
      },
      _sum: { totalCostUsd: true },
    });

    const total = Number(spent._sum.totalCostUsd ?? 0);
    return total > 0 ? total : null;
  }

  private async resolveOutcomeStatus(
    lead: {
      id: string;
      status: LeadStatus;
      updatedAt: Date;
    } | null,
    decidedAt: Date,
  ): Promise<DecisionOutcomeStatus> {
    if (!lead) return 'unknown';

    const daysSinceDecision =
      (Date.now() - decidedAt.getTime()) / (1000 * 60 * 60 * 24);

    if (daysSinceDecision < 7) return 'pending';

    if (lead.status === LeadStatus.CLIENT) return 'converted';
    if (lead.status === LeadStatus.LOST) return 'lost';

    const statusAtDecision = await this.getStatusAtTime(lead.id, decidedAt);
    const rankNow = STATUS_RANK[lead.status];
    const rankThen = STATUS_RANK[statusAtDecision];

    if (rankNow > rankThen) return 'progressed';
    if (daysSinceDecision >= 14) return 'stalled';

    return 'pending';
  }

  private async getStatusAtTime(leadId: string, at: Date): Promise<LeadStatus> {
    const change = await this.prisma.leadStatusChange.findFirst({
      where: { leadId, changedAt: { lte: at } },
      orderBy: { changedAt: 'desc' },
    });
    return change?.toStatus ?? LeadStatus.NEW;
  }

  private extractExpectedRevenue(recommendedAction: unknown): number | null {
    if (!recommendedAction || typeof recommendedAction !== 'object') {
      return null;
    }
    const rec = recommendedAction as ActionIntelligenceResult;
    return typeof rec.expectedRevenueUsd === 'number'
      ? rec.expectedRevenueUsd
      : null;
  }

  private computePredictionAccuracy(params: {
    outcomeStatus: DecisionOutcomeStatus;
    expectedValueUsd: number;
    expectedRoi: number | null;
    actualRoi: number | null;
    costDeviationUsd: number | null;
    expectedCostUsd: number;
  }): number | null {
    if (params.outcomeStatus === 'pending') return null;

    let outcomeScore = 0.5;
    switch (params.outcomeStatus) {
      case 'converted':
        outcomeScore = params.expectedValueUsd > 0 ? 0.95 : 0.7;
        break;
      case 'progressed':
        outcomeScore = params.expectedValueUsd > 0 ? 0.75 : 0.55;
        break;
      case 'stalled':
        outcomeScore = params.expectedValueUsd > 0.05 ? 0.35 : 0.6;
        break;
      case 'lost':
        outcomeScore = params.expectedValueUsd > 0.1 ? 0.15 : 0.5;
        break;
      default:
        outcomeScore = 0.5;
    }

    let costScore = 0.7;
    if (params.costDeviationUsd != null && params.expectedCostUsd > 0) {
      const deviationRatio =
        Math.abs(params.costDeviationUsd) / params.expectedCostUsd;
      costScore = Math.max(0, 1 - deviationRatio);
    }

    let roiScore = 0.6;
    if (params.expectedRoi != null && params.actualRoi != null) {
      const roiDelta = Math.abs(params.expectedRoi - params.actualRoi);
      roiScore = Math.max(0, 1 - roiDelta / Math.max(params.expectedRoi, 1));
    }

    return Math.min(
      1,
      Math.max(0, outcomeScore * 0.55 + costScore * 0.25 + roiScore * 0.2),
    );
  }

  private average(values: number[]): number | null {
    if (values.length === 0) return null;
    return values.reduce((s, v) => s + v, 0) / values.length;
  }

  private isDecisionOutcomeStatus(
    value: string,
  ): value is DecisionOutcomeStatus {
    return [
      'converted',
      'progressed',
      'stalled',
      'lost',
      'pending',
      'unknown',
    ].includes(value);
  }
}
