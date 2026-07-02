export type CommercialActionType =
  | 'SEND_FIRST_MESSAGE'
  | 'SEND_FOLLOWUP'
  | 'GENERATE_DEMO'
  | 'RE_ANALYZE'
  | 'WAIT'
  | 'NO_ACTION'
  | 'CREATE_GOAL';

export type RecommendationVerdict =
  | 'DO_NOW'
  | 'WAIT'
  | 'SKIP_BUDGET'
  | 'GENERATE_DEMO'
  | 'SKIP_DEMO'
  | 'USE_FLASH'
  | 'NO_ACTION';

export interface CiConfigWeights {
  ev: number;
  roi: number;
  prob: number;
  urgency: number;
  ease: number;
  cost: number;
}

export interface CiConfigThresholds {
  minEvToAct: number;
  minConfidence: number;
  riskWeight: number;
  baseDealValueUsd: number;
  probabilityWeights: {
    status: number;
    fit: number;
    channel: number;
    recency: number;
  };
  statusScores: Record<string, number>;
}

export interface CommercialIntelligenceConfigData {
  weights: CiConfigWeights;
  segments: Record<string, { multiplier: number }>;
  signals: Record<string, { multiplier: number }>;
  thresholds: CiConfigThresholds;
}

export interface ActionIntelligenceResult {
  actionType: CommercialActionType;
  taskKey?: string;
  targetType: 'lead' | 'global';
  targetId?: string;
  label: string;
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  selectedModel?: string;
  modelSource?: string;
  canReuse: boolean;
  reuseSavingsUsd: number;
  successProbability: number;
  expectedRevenueUsd: number;
  expectedValueUsd: number;
  expectedRoi: number | null;
  confidence: number;
  risk: number;
  priority: number;
  verdict: RecommendationVerdict;
  reason: string;
}

export interface TodayDashboardDto {
  summary: {
    opportunitiesEvaluated: number;
    recommendedCount: number;
    discardedCount: number;
    budgetRemainingUsd: number | null;
    budgetMonthlyLimitUsd: number | null;
    totalExpectedValueUsd: number;
    totalExpectedCostUsd: number;
    aggregateExpectedRoi: number | null;
  };
  recommended: ActionIntelligenceResult[];
  discarded: ActionIntelligenceResult[];
  topImpact: ActionIntelligenceResult[];
  configVersion: number;
}

export const DEFAULT_CI_CONFIG: CommercialIntelligenceConfigData = {
  weights: {
    ev: 0.35,
    roi: 0.25,
    prob: 0.15,
    urgency: 0.1,
    ease: 0.1,
    cost: 0.05,
  },
  segments: {
    standard: { multiplier: 1.0 },
    multi_branch: { multiplier: 1.4 },
    premium: { multiplier: 1.6 },
    high_intent: { multiplier: 2.0 },
    cold: { multiplier: 0.6 },
  },
  signals: {
    no_website: { multiplier: 1.15 },
    no_online_menu: { multiplier: 1.1 },
    has_whatsapp: { multiplier: 1.05 },
    multi_branch: { multiplier: 1.2 },
  },
  thresholds: {
    minEvToAct: 0.01,
    minConfidence: 0.4,
    riskWeight: 0.1,
    baseDealValueUsd: 348,
    probabilityWeights: {
      status: 0.4,
      fit: 0.35,
      channel: 0.15,
      recency: 0.1,
    },
    statusScores: {
      NEW: 0.15,
      ANALYZED: 0.25,
      CONTACTED: 0.35,
      INTERESTED: 0.55,
      MEETING_SCHEDULED: 0.75,
      CLIENT: 1.0,
      LOST: 0.05,
    },
  },
};
