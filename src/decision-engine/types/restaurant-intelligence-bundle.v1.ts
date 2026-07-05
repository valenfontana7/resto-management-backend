/**
 * Restaurant Intelligence Bundle — contrato congelado v1.0.0
 *
 * Cambios solo compatibles hacia atrás. Breaking changes → v2.
 * Consumidores: Revenue, CS, Growth, Copilot, Analytics.
 */
import type { DetectedOpportunity } from '../opportunities/types/opportunity.types';
import type { DetectedRecommendation } from '../recommendations/types/recommendation.types';
import type { DecisionExplanation } from '../recommendations/types/decision-explanation.types';
import type { RestaurantSuccessSnapshot } from '../rss/types/restaurant-success-snapshot.types';

export const RESTAURANT_INTELLIGENCE_BUNDLE_VERSION = '1.0.0' as const;

export type IntelligenceSnapshotStatus = 'ready' | 'pending' | 'none';

export interface QueueRankMeta {
  recommendationPriority: string | null;
  recommendationCode: string | null;
  opportunityPriority: string | null;
  opportunityCode: string | null;
  rssBand: string | null;
  rssValue: number | null;
  lifecycleStage: string;
  primaryReason: string;
}

export interface RestaurantIntelligenceBundle {
  contractVersion: typeof RESTAURANT_INTELLIGENCE_BUNDLE_VERSION;
  restaurantId: string;
  computedAt: string;
  status: IntelligenceSnapshotStatus;
  snapshot: RestaurantSuccessSnapshot | null;
  opportunities: DetectedOpportunity[];
  recommendations: DetectedRecommendation[];
  explanation: DecisionExplanation | null;
  queueRank: QueueRankMeta;
}

export interface RestaurantIntelligenceBundleSummary {
  contractVersion: typeof RESTAURANT_INTELLIGENCE_BUNDLE_VERSION;
  restaurantId: string;
  computedAt: string | null;
  status: IntelligenceSnapshotStatus;
}
