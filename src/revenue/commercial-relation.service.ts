import { Injectable, NotFoundException } from '@nestjs/common';
import { CommercialRelationStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DecisionEngineOrchestratorService } from '../decision-engine/decision-engine-orchestrator.service';
import { compareRevenueQueueRank } from '../decision-engine/queue/revenue-queue-rank';
import {
  RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
  type RestaurantIntelligenceBundle,
} from '../decision-engine/types/restaurant-intelligence-bundle.v1';
import {
  defaultNextAction,
  toRelationCardDto,
} from './commercial-relation.mapper';
import { LeadRevenueSyncService } from './lead-revenue-sync.service';
import { LogCommercialActionDto } from './dto/log-commercial-action.dto';
import type { IntelligenceBriefDto } from './intelligence-brief.dto';

@Injectable()
export class CommercialRelationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sync: LeadRevenueSyncService,
    private readonly orchestrator: DecisionEngineOrchestratorService,
  ) {}

  async getDayQueue(userId?: string) {
    const relations = await this.prisma.commercialRelation.findMany({
      include: { lead: true },
    });

    const restaurantIds = relations
      .map((r) => r.convertedRestaurantId)
      .filter((id): id is string => Boolean(id));

    const lifecycleMap = new Map<string, CommercialRelationStage>();
    for (const r of relations) {
      if (r.convertedRestaurantId) {
        lifecycleMap.set(r.convertedRestaurantId, r.stage);
      }
    }

    const bundles = await this.orchestrator.getSnapshotsBatch(
      restaurantIds,
      lifecycleMap,
    );

    const ownerFallback = userId ?? 'unassigned';

    const cards = relations.map((r) => {
      const bundle = r.convertedRestaurantId
        ? (bundles.get(r.convertedRestaurantId) ?? null)
        : null;
      return toRelationCardDto(
        r,
        ownerFallback,
        r.lead,
        this.toIntelligenceBrief(bundle, r.stage),
      );
    });

    cards.sort((a, b) => {
      const rankA = a.intelligence?.queueRank ?? {
        recommendationPriority: null,
        recommendationCode: null,
        opportunityPriority: null,
        opportunityCode: null,
        rssBand: null,
        rssValue: null,
        lifecycleStage: a.stage,
        primaryReason: '',
      };
      const rankB = b.intelligence?.queueRank ?? {
        recommendationPriority: null,
        recommendationCode: null,
        opportunityPriority: null,
        opportunityCode: null,
        rssBand: null,
        rssValue: null,
        lifecycleStage: b.stage,
        primaryReason: '',
      };

      const stageA = this.resolveStageEnum(a, relations);
      const stageB = this.resolveStageEnum(b, relations);

      return compareRevenueQueueRank(rankA, rankB, stageA, stageB);
    });

    const withIntelligence = cards.filter(
      (c) => c.intelligence?.status === 'ready',
    ).length;
    const critical = cards.filter(
      (c) => c.intelligence?.rss?.band === 'critical',
    ).length;
    const atRisk = cards.filter(
      (c) => c.intelligence?.rss?.band === 'at_risk',
    ).length;

    const parts: string[] = [];
    if (critical > 0) parts.push(`${critical} en Critical`);
    if (atRisk > 0) parts.push(`${atRisk} At Risk`);
    if (withIntelligence > 0) {
      parts.push(`${withIntelligence} con inteligencia evaluada`);
    }
    if (parts.length === 0) parts.push('Cola ordenada por Decision Engine');

    return {
      relations: cards,
      summaryLine: parts.join(' · '),
      overdueCount: cards.filter((r) => r.isOverdue).length,
      hotCount: cards.filter(
        (r) =>
          r.intelligence?.topRecommendation?.priority === 'high' ||
          r.intelligence?.topRecommendation?.priority === 'critical',
      ).length,
      generatedAt: new Date().toISOString(),
      contractVersion: RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
    };
  }

  async findById(id: string, userId?: string) {
    const relation = await this.prisma.commercialRelation.findUnique({
      where: { id },
      include: { lead: true },
    });
    if (!relation) return null;

    const bundle = relation.convertedRestaurantId
      ? await this.orchestrator.getSnapshot(relation.convertedRestaurantId, {
          lifecycleStage: relation.stage,
        })
      : null;

    return toRelationCardDto(
      relation,
      userId ?? 'unassigned',
      relation.lead,
      this.toIntelligenceBrief(bundle, relation.stage),
    );
  }

  async findByLeadId(leadId: string, userId?: string) {
    const relation = await this.prisma.commercialRelation.findUnique({
      where: { leadId },
      include: { lead: true },
    });
    if (!relation) return null;

    const bundle = relation.convertedRestaurantId
      ? await this.orchestrator.getSnapshot(relation.convertedRestaurantId, {
          lifecycleStage: relation.stage,
        })
      : null;

    return toRelationCardDto(
      relation,
      userId ?? 'unassigned',
      relation.lead,
      this.toIntelligenceBrief(bundle, relation.stage),
    );
  }

  async getBrief(relationId: string) {
    const relation = await this.prisma.commercialRelation.findUnique({
      where: { id: relationId },
      include: { lead: true },
    });
    if (!relation) {
      throw new NotFoundException(`Relación ${relationId} no encontrada`);
    }

    const card = await this.findById(relationId, relation.ownerId ?? undefined);
    const intel = card?.intelligence;
    const rec = intel?.topRecommendation;

    if (intel?.status === 'ready' && rec) {
      return {
        relationId,
        status: 'ready' as const,
        nextAction: rec.title,
        whyNow: [rec.summary, rec.explanation],
        job: rec.primaryJob,
        argumentSummary: rec.expectedOutcome,
        playbookId: rec.consumerHints.playbookId ?? null,
        playbookName: rec.recommendedJourneyType ?? null,
        draft: { channel: card!.channelsAvailable[0] ?? 'whatsapp', body: '' },
        warnings: [],
        intelligence: intel,
      };
    }

    if (intel?.status === 'pending') {
      return {
        relationId,
        status: 'partial' as const,
        nextAction: 'Pendiente evaluación de inteligencia',
        whyNow: ['El restaurante aún no tiene snapshot evaluado.'],
        job: relation.primaryJob,
        argumentSummary: 'Dispará evaluación manual en dev.',
        playbookId: null,
        playbookName: null,
        draft: { channel: 'whatsapp', body: '' },
        warnings: ['Snapshot pendiente'],
        intelligence: intel,
      };
    }

    return {
      relationId,
      status: 'partial' as const,
      nextAction: card?.nextAction ?? defaultNextAction(relation.stage),
      whyNow: [
        intel?.queueRankReason ??
          'Relación pre-venta sin restaurante vinculado — ver Leads.',
      ],
      job: relation.primaryJob,
      argumentSummary: relation.primaryJob
        ? `Enfocá la conversación en: ${relation.primaryJob}.`
        : 'Definir Job dominante antes del próximo contacto.',
      playbookId: null,
      playbookName: null,
      draft: {
        channel: card?.channelsAvailable[0] ?? 'whatsapp',
        body: '',
      },
      warnings: relation.primaryJob ? [] : ['Completar Job dominante'],
      intelligence: intel,
    };
  }

  async getTimeline(relationId: string) {
    const relation = await this.prisma.commercialRelation.findUnique({
      where: { id: relationId },
      include: {
        logs: { orderBy: { createdAt: 'desc' }, take: 20 },
        lead: {
          include: {
            statusHistory: { orderBy: { changedAt: 'desc' }, take: 10 },
          },
        },
      },
    });
    if (!relation) {
      throw new NotFoundException(`Relación ${relationId} no encontrada`);
    }

    const items: Array<{
      id: string;
      at: string;
      channel: string;
      summary: string;
      actor: 'human' | 'system';
    }> = [];

    if (relation.convertedRestaurantId) {
      const bundle = await this.orchestrator.getSnapshot(
        relation.convertedRestaurantId,
        { lifecycleStage: relation.stage },
      );
      if (bundle?.computedAt) {
        items.push({
          id: `intel-${relation.convertedRestaurantId}`,
          at: bundle.computedAt,
          channel: 'Decision Engine',
          summary: `Snapshot v${bundle.contractVersion} — RSS ${bundle.snapshot?.rss.value ?? '?'} (${bundle.snapshot?.rss.bandLabel ?? '—'})`,
          actor: 'system',
        });
      }
    }

    const logItems = relation.logs.map((log) => ({
      id: log.id,
      at: log.createdAt.toISOString(),
      channel: 'Registro',
      summary: `Resultado: ${log.result}${log.note ? ` — ${log.note}` : ''}`,
      actor: 'human' as const,
    }));

    const statusItems =
      relation.lead?.statusHistory.map((change) => ({
        id: change.id,
        at: change.changedAt.toISOString(),
        channel: 'Leads',
        summary: change.fromStatus
          ? `${change.fromStatus} → ${change.toStatus}`
          : `Inicio → ${change.toStatus}`,
        actor: 'system' as const,
      })) ?? [];

    return [...items, ...logItems, ...statusItems];
  }

  async logAction(
    relationId: string,
    dto: LogCommercialActionDto,
    userId?: string,
  ) {
    const relation = await this.prisma.commercialRelation.findUnique({
      where: { id: relationId },
    });
    if (!relation) {
      throw new NotFoundException(`Relación ${relationId} no encontrada`);
    }

    await this.prisma.commercialRelationLog.create({
      data: {
        relationId,
        result: dto.result,
        note: dto.note?.trim() || null,
        loggedById: userId,
      },
    });

    const nextDue = new Date();
    nextDue.setDate(nextDue.getDate() + 2);

    await this.prisma.commercialRelation.update({
      where: { id: relationId },
      data: {
        nextAction: defaultNextAction(relation.stage),
        nextActionDue: nextDue,
      },
    });

    return { success: true };
  }

  async syncAllLeads() {
    return this.sync.syncAllMissing();
  }

  private toIntelligenceBrief(
    bundle: RestaurantIntelligenceBundle | null,
    stage: CommercialRelationStage,
  ): IntelligenceBriefDto | null {
    if (!bundle) {
      return {
        contractVersion: RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
        status: 'none',
        computedAt: null,
        rss: null,
        topRecommendation: null,
        topOpportunity: null,
        queueRankReason: `Lifecycle ${stage} — sin restaurante vinculado`,
        explanation: null,
        recommendations: [],
        opportunities: [],
        queueRank: null,
      };
    }

    return {
      contractVersion: bundle.contractVersion,
      status: bundle.status,
      computedAt: bundle.computedAt,
      rss: bundle.snapshot
        ? {
            value: bundle.snapshot.rss.value,
            band: bundle.snapshot.rss.band,
            bandLabel: bundle.snapshot.rss.bandLabel,
            trend7d: bundle.snapshot.rss.trend7d,
            delta7d: bundle.snapshot.rss.delta7d,
          }
        : null,
      topRecommendation: bundle.recommendations[0] ?? null,
      topOpportunity: bundle.opportunities[0] ?? null,
      queueRankReason: bundle.queueRank.primaryReason,
      explanation: bundle.explanation,
      recommendations: bundle.recommendations,
      opportunities: bundle.opportunities,
      queueRank: bundle.queueRank,
    };
  }

  private resolveStageEnum(
    card: { id: string },
    relations: Array<{ id: string; stage: CommercialRelationStage }>,
  ): CommercialRelationStage {
    return relations.find((r) => r.id === card.id)?.stage ?? 'LEAD';
  }
}
