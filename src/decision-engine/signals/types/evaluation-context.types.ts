export type RestaurantIntent = 'digital' | 'operations' | 'both';

/**
 * @see docs/implementation/DECISION_ENGINE_IMPLEMENTATION.md § EvaluationContext
 */
export interface EvaluationContext {
  restaurantId: string;
  evaluatedAt: Date;
  intent: RestaurantIntent;
  lifecycleStage?: string;
  relationshipStage?: string;
  tenureDays: number;
  trialDay?: number | null;
  baseline?: {
    windowWeeks: number;
    ordersPerWeek?: number;
    valueEventsPerWeek?: number;
  };
  activeSuppressions?: string[];
  modelVersion: string;
  ruleCatalogVersion: string;
  previousSnapshotId?: string;
}

export const DEFAULT_MODEL_VERSION = '1.0.0';
export const DEFAULT_RULE_CATALOG_VERSION = '1.0.0';

export const INACTIVITY_DAYS_THRESHOLD = 14;
export const ENGAGEMENT_INACTIVITY_DAYS_THRESHOLD = 14;
export const TRIAL_MILESTONE_DAY = 10;
export const WEEKLY_OPS_MIN_EVENTS = 1;
export const VOLUME_DROP_BASELINE_MIN_ORDERS = 5;
export const VOLUME_DROP_RATIO = 0.6;
