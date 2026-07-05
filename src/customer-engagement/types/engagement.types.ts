import type { DetectedRecommendation } from '../../decision-engine/recommendations/types/recommendation.types';
import type { RestaurantSuccessSnapshot } from '../../decision-engine/rss/types/restaurant-success-snapshot.types';
import type { RestaurantIntelligenceBundle } from '../../decision-engine/types/restaurant-intelligence-bundle.v1';
import type { EngagementChannelType } from './channel.types';
import type { ScheduledDelivery } from './delivery.types';
import type { EngagementPolicyDecision } from './engagement-policy.types';
import type { JourneySelection } from './journey.types';
import type { PersonalizedMessage } from './template.types';

export const CUSTOMER_ENGAGEMENT_ENGINE_VERSION = '1.1.0' as const;

/** Contexto de personalización — metadata del restaurante, no señales ni eventos. */
export interface EngagementPersonalizationContext {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  ownerUserId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  ownerPhone: string | null;
  firstName: string | null;
  adminUrl: string;
  ctaUrl: string;
  daysInactive: number | null;
  tenureDays: number | null;
  rss: number | null;
  rssBand: string | null;
  rssDelta7d: number | null;
  topRecommendationTitle: string | null;
  primaryJob: string | null;
  expectedOutcome: string | null;
}

export interface EngagementDecision {
  id: string;
  restaurantId: string;
  recommendationId: string;
  recommendationCode: string;
  decidedAt: string;
  shouldCommunicate: boolean;
  policy: EngagementPolicyDecision;
  journey: JourneySelection | null;
  channel: EngagementChannelType | null;
  templateId: string | null;
  message: PersonalizedMessage | null;
  delivery: ScheduledDelivery | null;
  trace: EngagementDecisionTrace;
}

export interface EngagementDecisionTrace {
  engineVersion: typeof CUSTOMER_ENGAGEMENT_ENGINE_VERSION;
  bundleComputedAt: string | null;
  signalIds: string[];
  opportunityIds: string[];
  principles: string[];
  explanationSummary: string | null;
}

export interface EngagementPlanResult {
  contractVersion: typeof CUSTOMER_ENGAGEMENT_ENGINE_VERSION;
  restaurantId: string;
  computedAt: string;
  bundleStatus: RestaurantIntelligenceBundle['status'];
  recommendationsConsidered: number;
  decisions: EngagementDecision[];
  scheduledDeliveries: ScheduledDelivery[];
  skipped: Array<{
    recommendationCode: string;
    reason: string;
  }>;
}

export interface EngagementProcessInput {
  restaurantId: string;
  recommendation: DetectedRecommendation;
  snapshot: RestaurantSuccessSnapshot;
  bundle: RestaurantIntelligenceBundle;
  personalization: EngagementPersonalizationContext;
  dryRun?: boolean;
  /** Índice del paso J-* cuando es follow-up de journey (default 0). */
  journeyStepIndex?: number;
}
