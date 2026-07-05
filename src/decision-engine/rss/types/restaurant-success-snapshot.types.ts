import type { ProducedSignal } from '../../signals/types/signal.types';
import type { RestaurantIntent } from '../../signals/types/evaluation-context.types';
import type { RssBandId, RssDimensionId } from '../catalog/rss-catalog.loader';

export interface SignalFactor {
  signalCode: string;
  label: string;
  direction: 'positive' | 'negative';
  weight: 'high' | 'medium' | 'low';
  impactPoints: number;
}

export interface DimensionExplanation {
  why: string;
  influencingSignals: SignalFactor[];
  improvementHint: string;
}

export interface DimensionEvaluationResult {
  dimensionId: RssDimensionId;
  label: string;
  score: number;
  rssWeight: number;
  explanation: DimensionExplanation;
  signalsUsed: string[];
  internalOpportunities: string[];
}

export interface RssExplanation {
  headline: string;
  summary: string;
  dimensionSummaries: {
    dimensionId: RssDimensionId;
    label: string;
    score: number;
    why: string;
  }[];
  improvementPriorities: string[];
}

export interface RestaurantSuccessSnapshot {
  restaurantId: string;
  computedAt: string;
  algorithmVersion: string;
  modelVersion: string;
  weightsCatalogVersion: string;
  bandsCatalogVersion: string;
  rss: {
    value: number;
    band: RssBandId;
    bandLabel: string;
    delta7d: number | null;
    delta30d: number | null;
    trend7d: 'up' | 'stable' | 'down' | null;
  };
  dimensions: Record<RssDimensionId, DimensionEvaluationResult>;
  topFactors: SignalFactor[];
  explanation: RssExplanation;
  signalsConsidered: string[];
  signalIds: string[];
  overlaysApplied: string[];
  primaryJob: string | null;
  metadata: {
    intent: RestaurantIntent;
    tenureDays: number;
    traceability: {
      algorithmVersion: string;
      weightsVersion: string;
      bandsVersion: string;
      signalsCount: number;
    };
  };
}

export interface RssEngineContext {
  restaurantId: string;
  evaluatedAt: Date;
  intent: RestaurantIntent;
  tenureDays: number;
  modelVersion: string;
}

export interface RssEngineInput {
  signals: ProducedSignal[];
  context: RssEngineContext;
  previousSnapshot?: RestaurantSuccessSnapshot | null;
  historicalSnapshots?: RestaurantSuccessSnapshot[];
}

export interface RssEngineOutput {
  snapshot: RestaurantSuccessSnapshot;
  decisionLog: RssDecisionLog;
}

export interface RssDecisionLog {
  restaurantId: string;
  evaluatedAt: string;
  algorithmVersion: string;
  dimensionEvaluatorsRun: string[];
  overlaysApplied: string[];
  rawRssBeforeOverlays: number;
  finalRss: number;
  summary: string;
}
