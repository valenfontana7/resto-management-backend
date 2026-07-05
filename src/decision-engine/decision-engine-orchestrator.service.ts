import { Injectable, NotFoundException } from '@nestjs/common';
import { RestaurantEventAdapterService } from './adapters/restaurant-event.adapter';
import { OpportunityEngineService } from './opportunities/opportunity-engine.service';
import { RecommendationEngineService } from './recommendations/recommendation-engine.service';
import { RssEngineService } from './rss/rss-engine.service';
import { SignalEngineService } from './signals/signal-engine.service';
import { buildQueueRankMeta } from './queue/revenue-queue-rank';
import { IntelligenceSnapshotStore } from './stores/intelligence-snapshot.store';
import {
  RESTAURANT_INTELLIGENCE_BUNDLE_VERSION,
  type RestaurantIntelligenceBundle,
} from './types/restaurant-intelligence-bundle.v1';
import type { CommercialRelationStage } from '@prisma/client';

@Injectable()
export class DecisionEngineOrchestratorService {
  constructor(
    private readonly eventAdapter: RestaurantEventAdapterService,
    private readonly signalEngine: SignalEngineService,
    private readonly rssEngine: RssEngineService,
    private readonly opportunityEngine: OpportunityEngineService,
    private readonly recommendationEngine: RecommendationEngineService,
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
    const signalOutput = this.signalEngine.evaluateFromEvents(
      events,
      evalContext,
    );

    const { snapshot } = this.rssEngine.evaluate({
      signals: signalOutput.signals,
      context: {
        restaurantId: evalContext.restaurantId,
        evaluatedAt: evalContext.evaluatedAt,
        intent: evalContext.intent,
        tenureDays: evalContext.tenureDays,
        modelVersion: evalContext.modelVersion,
      },
    });

    const oppOutput = this.opportunityEngine.evaluate({
      snapshot,
      context: { trialDay: evalContext.trialDay ?? null },
    });

    const recOutput = this.recommendationEngine.evaluate({
      opportunities: oppOutput.opportunities,
      snapshot,
    });

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

    this.snapshotStore.set(bundle);
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

    const cached = this.snapshotStore.get(restaurantId);
    if (cached) return cached;

    try {
      return await this.evaluateRestaurant(
        restaurantId,
        options?.lifecycleStage ?? 'CLIENT',
      );
    } catch {
      return null;
    }
  }

  async getSnapshotsBatch(
    restaurantIds: string[],
    lifecycleByRestaurant: Map<string, CommercialRelationStage>,
  ): Promise<Map<string, RestaurantIntelligenceBundle>> {
    const result = new Map<string, RestaurantIntelligenceBundle>();

    await Promise.all(
      restaurantIds.map(async (id) => {
        const bundle = await this.getSnapshot(id, {
          lifecycleStage: lifecycleByRestaurant.get(id) ?? 'CLIENT',
        });
        if (bundle) result.set(id, bundle);
      }),
    );

    return result;
  }
}
