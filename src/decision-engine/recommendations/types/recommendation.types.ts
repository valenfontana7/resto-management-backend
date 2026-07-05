import type {
  RecommendationConfidence,
  RecommendationPriority,
  RecommendationEffort,
  EstimatedImpact,
  ConsumerHints,
} from '../catalog/recommendation-catalog.loader';
import type { RecommendationStrategyId } from '../catalog/strategy-catalog.loader';
import type { RssDimensionId } from '../../rss/catalog/rss-catalog.loader';
import type { RestaurantSuccessSnapshot } from '../../rss/types/restaurant-success-snapshot.types';
import type { DetectedOpportunity } from '../../opportunities/types/opportunity.types';
import type { DecisionExplanation } from './decision-explanation.types';
import type { RecommendationDecisionLog } from './recommendation-decision-log.types';

export const RECOMMENDATION_RULE_VERSION = '1.0.0';

export interface DetectedRecommendation {
  id: string;
  code: string;
  strategy: RecommendationStrategyId;
  priority: RecommendationPriority;
  confidence: RecommendationConfidence;
  title: string;
  summary: string;
  explanation: string;
  opportunityIds: string[];
  signalIds: string[];
  rssDimensions: RssDimensionId[];
  expectedOutcome: string;
  recommendedJourneyType: string;
  estimatedImpact: EstimatedImpact;
  estimatedEffort: RecommendationEffort;
  primaryJob: string;
  consumerHints: ConsumerHints;
  principles: string[];
  createdAt: string;
  ruleVersion: string;
  ruleId: string;
}

export interface ActiveRecommendationRecord extends DetectedRecommendation {
  activatedAt: string;
  status: 'active';
}

export interface RecommendationEngineContext {
  lifecycleStage?: string;
  activeSuppressions?: string[];
  evaluatedAt?: Date;
}

export interface RecommendationEngineInput {
  opportunities: DetectedOpportunity[];
  snapshot: RestaurantSuccessSnapshot;
  context?: RecommendationEngineContext;
  activeRecommendations?: ActiveRecommendationRecord[];
}

export interface RecommendationEngineOutput {
  recommendations: DetectedRecommendation[];
  backlog: DetectedRecommendation[];
  expired: string[];
  superseded: string[];
  activeRecommendations: ActiveRecommendationRecord[];
  explanation: DecisionExplanation;
  decisionLog: RecommendationDecisionLog;
}
