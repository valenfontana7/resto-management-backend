export const LIFECYCLE_MARKETING_ENGINE_VERSION = '1.0.0' as const;

export type LifecycleCampaignType =
  | 'WELCOME'
  | 'ONBOARDING'
  | 'ACTIVATION'
  | 'FIRST_VALUE'
  | 'FEATURE_ADOPTION'
  | 'INACTIVITY'
  | 'RECOVERY'
  | 'CHURN_PREVENTION'
  | 'CHECK_IN'
  | 'MILESTONE'
  | 'CELEBRATION'
  | 'NPS'
  | 'REFERRAL'
  | 'UPSELL'
  | 'RENEWAL'
  | 'WINBACK';

export type LifecycleChannelType =
  | 'email'
  | 'whatsapp'
  | 'in_app'
  | 'push'
  | 'cs_task';

export type LifecycleRssBand =
  | 'critical'
  | 'at_risk'
  | 'attention'
  | 'healthy'
  | 'champion';

export interface LifecycleCampaignEntryConditions {
  /** Al menos una REC activa del snapshot debe coincidir */
  requiresRecommendationCodes?: string[];
  /** O al menos una OPP abierta del snapshot */
  requiresOpportunityCodes?: string[];
  /** Bandas RSS permitidas (siempre desde snapshot, nunca recalculadas) */
  rssBands?: LifecycleRssBand[];
  minDaysInactive?: number;
  maxDaysInactive?: number;
  lifecycleStages?: string[];
}

export interface LifecycleCampaignExitConditions {
  rssBands?: LifecycleRssBand[];
  maxDeliveries?: number;
  goalCompletedEventTypes?: string[];
}

export interface LifecycleCampaignSuppressionRules {
  respectChampionBlock?: boolean;
  blockIfActiveCampaignTypes?: LifecycleCampaignType[];
  blockIfRecentDeliveryHours?: number;
}

export interface LifecycleCampaignStepDefinition {
  stepId: string;
  delayDays: number;
  channel: LifecycleChannelType;
  templateId: string;
  fallbackChannel?: LifecycleChannelType;
}

export interface LifecycleCampaignDefinition {
  id: string;
  type: LifecycleCampaignType;
  goal: string;
  priority: number;
  cooldownDays: number;
  recommendedChannel: LifecycleChannelType;
  recommendedChannels: LifecycleChannelType[];
  entryConditions: LifecycleCampaignEntryConditions;
  exitConditions: LifecycleCampaignExitConditions;
  suppressionRules: LifecycleCampaignSuppressionRules;
  templates: string[];
  steps: LifecycleCampaignStepDefinition[];
  expectedOutcome: string;
  successMetric: string;
  primaryJob?: string;
}

export interface LifecycleRecommendationBinding {
  recommendationCode: string;
  campaignId: string;
  priority?: number;
}

export interface LifecycleCampaignCatalogDocument {
  version: string;
  globalFrequencyCapDays: number;
  globalMaxMessagesPerWindow: number;
  campaigns: LifecycleCampaignDefinition[];
  recommendationBindings: LifecycleRecommendationBinding[];
}

export interface LifecycleCampaignEvaluationContext {
  restaurantId: string;
  recentDeliveryCount: number;
  lastDeliveryAt: Date | null;
  daysSinceLastCampaignDelivery: number | null;
  activeCampaignTypes: LifecycleCampaignType[];
}

export interface LifecycleCampaignEvaluationResult {
  campaignId: string;
  campaignType: LifecycleCampaignType;
  eligible: boolean;
  shouldCommunicate: boolean;
  reason: string;
  intelligenceBacked: boolean;
  recommendationCode: string | null;
  opportunityCode: string | null;
  selectedStep: LifecycleCampaignStepDefinition | null;
  selectedChannel: LifecycleChannelType | null;
  selectedTemplateId: string | null;
}

export interface LifecycleCampaignPlanResult {
  contractVersion: typeof LIFECYCLE_MARKETING_ENGINE_VERSION;
  restaurantId: string;
  computedAt: string;
  bundleStatus: string;
  recommendationsConsidered: number;
  evaluations: LifecycleCampaignEvaluationResult[];
  scheduledDeliveries: LifecycleScheduledDeliveryPreview[];
  skipped: Array<{ campaignId: string; reason: string }>;
}

export interface LifecycleScheduledDeliveryPreview {
  id: string;
  campaignId: string;
  campaignType: LifecycleCampaignType;
  stepId: string;
  channel: LifecycleChannelType;
  templateId: string;
  deliverAt: string;
  subject: string | null;
  bodyPreview: string;
}
