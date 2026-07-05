export const ENGAGEMENT_OUTCOME_TYPES = [
  'opened',
  'clicked',
  'replied',
  'goal_completed',
  'ignored',
  'unsubscribed',
  'rss_contribution',
] as const;

export type EngagementOutcomeType = (typeof ENGAGEMENT_OUTCOME_TYPES)[number];

export interface EngagementOutcomeRecord {
  id: string;
  deliveryId: string;
  restaurantId: string;
  recommendationCode: string;
  type: EngagementOutcomeType;
  recordedAt: string;
  rssBefore: number | null;
  rssAfter: number | null;
  rssDelta: number | null;
  metadata: Record<string, unknown>;
}

export interface OutcomeRegistrationInput {
  deliveryId: string;
  type: EngagementOutcomeType;
  rssAfter?: number | null;
  metadata?: Record<string, unknown>;
}
