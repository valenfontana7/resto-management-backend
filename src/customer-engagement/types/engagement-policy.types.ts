import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../../decision-engine/rss/types/restaurant-success-snapshot.types';
import type { EngagementChannelType } from './channel.types';

export interface EngagementPolicyDefinition {
  id: string;
  label: string;
  recommendationCodes: string[];
  /** Solo comunicar si la REC tiene esta prioridad mínima (inclusive). */
  minPriority: 'critical' | 'high' | 'medium' | 'low';
  frequencyCapDays: number;
  maxMessagesPerWindow: number;
  preferredChannels: EngagementChannelType[];
  journeyTypeHint: string | null;
  /** Días mínimos desde activación de la REC antes de contactar (anti-spam). */
  minDaysSinceRecommendation: number;
  /** No contactar si RSS en banda champion y policy es de activación básica. */
  respectChampionBlock: boolean;
}

export interface EngagementPolicyEvaluationContext {
  recentDeliveryCount: number;
  lastDeliveryAt: string | null;
  sameRecommendationSentWithinDays: number | null;
}

export interface EngagementPolicyDecision {
  policyId: string;
  shouldCommunicate: boolean;
  reason: string;
  matchedRecommendationCode: string;
  frequencyCapApplied: boolean;
  championBlocked: boolean;
}

export interface EngagementPolicyEvaluatorInput {
  recommendation: DetectedRecommendation;
  snapshot: RestaurantSuccessSnapshot;
  policy: EngagementPolicyDefinition;
  context: EngagementPolicyEvaluationContext;
}
