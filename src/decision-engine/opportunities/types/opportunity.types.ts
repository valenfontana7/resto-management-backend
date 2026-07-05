import type {
  OpportunityCategory,
  OpportunityConfidence,
  OpportunityPriority,
} from '../catalog/opportunity-catalog.loader';
import type { RssDimensionId } from '../../rss/catalog/rss-catalog.loader';
import type { RestaurantSuccessSnapshot } from '../../rss/types/restaurant-success-snapshot.types';

export const OPPORTUNITY_RULE_VERSION = '1.0.0';

export interface DetectedOpportunity {
  id: string;
  code: string;
  category: OpportunityCategory;
  priority: OpportunityPriority;
  confidence: OpportunityConfidence;
  title: string;
  description: string;
  explanation: string;
  signalIds: string[];
  rssDimensions: RssDimensionId[];
  supportingSignals: string[];
  expectedOutcome: string;
  recommendedActionType: string;
  primaryJob: string;
  createdAt: string;
  ruleVersion: string;
  ruleId: string;
}

export interface OpenOpportunityRecord extends DetectedOpportunity {
  openedAt: string;
  status: 'open';
}

export interface OpportunityEngineContext {
  lifecycleStage?: string;
  trialDay?: number | null;
  evaluatedAt?: Date;
}

export interface OpportunityEngineInput {
  snapshot: RestaurantSuccessSnapshot;
  context?: OpportunityEngineContext;
  openOpportunities?: OpenOpportunityRecord[];
}

export interface OpportunityCloseRecord {
  opportunityId: string;
  code: string;
  reason: string;
  evidenceSignalIds: string[];
}

import type { OpportunityDecisionLog } from './opportunity-decision-log.types';

export interface OpportunityEngineOutput {
  opportunities: DetectedOpportunity[];
  backlog: DetectedOpportunity[];
  toOpen: DetectedOpportunity[];
  toClose: OpportunityCloseRecord[];
  toExpire: string[];
  openOpportunities: OpenOpportunityRecord[];
  decisionLog: OpportunityDecisionLog;
}
