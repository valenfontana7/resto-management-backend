import type { DetectedOpportunity } from '../decision-engine/opportunities/types/opportunity.types';
import type { DetectedRecommendation } from '../decision-engine/recommendations/types/recommendation.types';
import type { DecisionExplanation } from '../decision-engine/recommendations/types/decision-explanation.types';
import type { QueueRankMeta } from '../decision-engine/types/restaurant-intelligence-bundle.v1';

export type IntelligenceBriefDto = {
  contractVersion: string;
  status: 'ready' | 'pending' | 'none';
  computedAt: string | null;
  rss: {
    value: number;
    band: string;
    bandLabel: string;
    trend7d: string | null;
    delta7d: number | null;
  } | null;
  topRecommendation: DetectedRecommendation | null;
  topOpportunity: DetectedOpportunity | null;
  queueRankReason: string;
  explanation: DecisionExplanation | null;
  recommendations: DetectedRecommendation[];
  opportunities: DetectedOpportunity[];
  queueRank: QueueRankMeta | null;
};

export type RelationCardDto = {
  id: string;
  leadId: string | null;
  convertedRestaurantId: string | null;
  name: string;
  stage: string;
  stageFamily: 'early' | 'conversation' | 'demo' | 'close' | 'risk';
  /** @deprecated Orden desde Decision Engine — no usar para ranking en UI */
  priorityScore: number;
  intentScore: number;
  opportunityScore: number;
  primaryJob: string | null;
  signalSummary: string;
  nextAction: string;
  nextActionDue: string;
  isOverdue: boolean;
  channelsAvailable: string[];
  ownerId: string;
  neighborhood: string;
  localType: string;
  branches: number;
  presence: {
    instagram: string;
    google: string;
    pedidosYa: string;
    website: string;
  };
  tags: string[];
  intelligence: IntelligenceBriefDto | null;
};
