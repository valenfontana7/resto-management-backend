import { Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantEventAdapterService } from './adapters/restaurant-event.adapter';
import { OpportunityEngineService } from './opportunities/opportunity-engine.service';
import { PrismaOpportunityStateStore } from './opportunities/stores/prisma-opportunity-state.store';
import { RecommendationEngineService } from './recommendations/recommendation-engine.service';
import { PrismaRecommendationStateStore } from './recommendations/stores/prisma-recommendation-state.store';
import { RssEngineService } from './rss/rss-engine.service';
import { PrismaRssHistoryStore } from './rss/stores/prisma-rss-history.store';
import { SignalEngineService } from './signals/signal-engine.service';
import { PrismaSignalStateStore } from './signals/stores/prisma-signal-state.store';
import { buildQueueRankMeta } from './queue/revenue-queue-rank';
import { IntelligenceSnapshotStore } from './stores/intelligence-snapshot.store';
import {
  RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
  type RestaurantIntelligenceBundle,
} from './types/restaurant-intelligence-bundle.v1';
import type { CommercialRelationStage } from '@prisma/client';
import {
  INTELLIGENCE_SNAPSHOT_TTL_MS,
  isIntelligenceSnapshotFresh,
} from './constants/snapshot-cache.constants';

export interface SnapshotBatchOptions {
  evaluateIfMissing?: boolean;
  /** Re-evalúa snapshots cacheados más viejos que el TTL. Default false. */
  refreshStale?: boolean;
  cacheTtlMs?: number;
}

@Injectable()
export class DecisionEngineOrchestratorService {
  constructor(
    private readonly eventAdapter: RestaurantEventAdapterService,
    private readonly signalEngine: SignalEngineService,
    private readonly signalStateStore: PrismaSignalStateStore,
    private readonly rssEngine: RssEngineService,
    private readonly rssHistoryStore: PrismaRssHistoryStore,
    private readonly opportunityEngine: OpportunityEngineService,
    private readonly opportunityStateStore: PrismaOpportunityStateStore,
    private readonly recommendationEngine: RecommendationEngineService,
    private readonly recommendationStateStore: PrismaRecommendationStateStore,
    private readonly snapshotStore: IntelligenceSnapshotStore,
  ) {}

  async evaluateRestaurant(
    restaurantId: string,
    lifecycleStage: CommercialRelationStage = 'CLIENT',
  ): Promise<RestaurantIntelligenceBundle> {
    const evalContext =
      await this.eventAdapter.loadEvaluationContext(restaurantId);
    if (!evalContext) {
      throw new NotFoundException(`Restaurant ${restaurantId} not found`);
    }

    const events = await this.eventAdapter.loadDomainEvents(restaurantId);
    const priorSignals =
      await this.signalStateStore.getActiveSignals(restaurantId);
    const signalOutput = this.signalEngine.evaluateFromEvents(
      events,
      evalContext,
      priorSignals,
    );
    await this.signalStateStore.saveSignals(restaurantId, signalOutput.signals);

    const rssHistory = await this.rssHistoryStore.getHistory(restaurantId);
    const { snapshot } = this.rssEngine.evaluate({
      signals: signalOutput.signals,
      historicalSnapshots: rssHistory,
      context: {
        restaurantId: evalContext.restaurantId,
        evaluatedAt: evalContext.evaluatedAt,
        intent: evalContext.intent,
        tenureDays: evalContext.tenureDays,
        modelVersion: evalContext.modelVersion,
      },
    });
    await this.rssHistoryStore.append(snapshot);

    const priorOpen = await this.opportunityStateStore.getOpen(restaurantId);
    const oppOutput = this.opportunityEngine.evaluate({
      snapshot,
      context: { trialDay: evalContext.trialDay ?? null },
      openOpportunities: priorOpen,
    });
    await this.opportunityStateStore.setOpen(
      restaurantId,
      oppOutput.openOpportunities,
    );

    const priorRecommendations =
      await this.recommendationStateStore.getActive(restaurantId);
    const recOutput = this.recommendationEngine.evaluate({
      opportunities: oppOutput.opportunities,
      snapshot,
      activeRecommendations: priorRecommendations,
    });
    await this.recommendationStateStore.setActive(
      restaurantId,
      recOutput.activeRecommendations,
    );

    const topRec = recOutput.recommendations[0] ?? null;
    const topOpp = oppOutput.opportunities[0] ?? null;

    const bundle: RestaurantIntelligenceBundle = {
      contractVersion: RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
      restaurantId,
      computedAt: evalContext.evaluatedAt.toISOString(),
      status: 'ready',
      snapshot,
      opportunities: oppOutput.opportunities,
      recommendations: recOutput.recommendations,
      explanation: recOutput.explanation,
      queueRank: buildQueueRankMeta(
        lifecycleStage,
        topRec
          ? {
              code: topRec.code,
              priority: topRec.priority,
              summary: topRec.summary,
            }
          : null,
        topOpp
          ? {
              code: topOpp.code,
              priority: topOpp.priority,
              title: topOpp.title,
            }
          : null,
        { band: snapshot.rss.band, value: snapshot.rss.value },
      ),
    };

    await this.snapshotStore.set(bundle);
    return bundle;
  }

  async getSnapshot(
    restaurantId: string,
    options?: { refresh?: boolean; lifecycleStage?: CommercialRelationStage },
  ): Promise<RestaurantIntelligenceBundle | null> {
    if (options?.refresh) {
      return this.evaluateRestaurant(
        restaurantId,
        options.lifecycleStage ?? 'CLIENT',
      );
    }

    return this.snapshotStore.get(restaurantId);
  }

  async getSnapshotsBatch(
    restaurantIds: string[],
    lifecycleByRestaurant: Map<string, CommercialRelationStage>,
    options?: SnapshotBatchOptions,
  ): Promise<Map<string, RestaurantIntelligenceBundle>> {
    const result = new Map<string, RestaurantIntelligenceBundle>();
    const uniqueIds = [...new Set(restaurantIds)];

    const ttlMs = options?.cacheTtlMs ?? INTELLIGENCE_SNAPSHOT_TTL_MS;
    const refreshStale = options?.refreshStale ?? false;

    const cached = await this.snapshotStore.getMany(uniqueIds);
    const toEvaluate: string[] = [];

    for (const id of uniqueIds) {
      const bundle = cached.get(id);
      if (!bundle) {
        toEvaluate.push(id);
        continue;
      }

      result.set(id, bundle);

      if (
        refreshStale &&
        !isIntelligenceSnapshotFresh(bundle.computedAt, ttlMs)
      ) {
        toEvaluate.push(id);
      }
    }

    if (toEvaluate.length === 0 || !options?.evaluateIfMissing) {
      return result;
    }

    await Promise.all(
      toEvaluate.map(async (id) => {
        try {
          const bundle = await this.evaluateRestaurant(
            id,
            lifecycleByRestaurant.get(id) ?? 'CLIENT',
          );
          result.set(id, bundle);
        } catch {
          /* omit restaurant on evaluation failure */
        }
      }),
    );

    return result;
  }
}
