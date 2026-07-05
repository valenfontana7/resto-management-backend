import type { SignalCatalogEntry } from '../catalog/signal-catalog.loader';
import type { DecisionDomainEvent } from './domain-event.types';
import type { EvaluationContext } from './evaluation-context.types';
import type { SignalDecisionLog } from './decision-log.types';

export type SignalCategory =
  | 'configuration'
  | 'operation'
  | 'business'
  | 'engagement'
  | 'risk';

export type SignalSeverity = 'P0' | 'P1' | 'P2';

export type SignalDirection = 'positive' | 'negative' | 'neutral';

export type SignalStatus = 'active' | 'expired';

/**
 * Produced signal — aligns with Platform SignalRecord + engineering ticket fields.
 * @see docs/implementation/DECISION_ENGINE_IMPLEMENTATION.md § SignalEngine
 */
export interface ProducedSignal {
  id: string;
  code: string;
  category: SignalCategory;
  severity: SignalSeverity;
  direction: SignalDirection;
  restaurantId: string;
  status: SignalStatus;
  detectedAt: Date;
  sourceEventIds: string[];
  explanation: string;
  metadata: Record<string, unknown>;
  ruleVersion: string;
  ruleId: string;
  primaryJob: string;
  dimension: string;
}

export interface SignalEvaluationTrace {
  eventId: string;
  ruleId: string;
  signalCode: string;
}

export interface SignalEngineInput {
  events: DecisionDomainEvent[];
  signalState: ProducedSignal[];
  context: EvaluationContext;
  ruleCatalogVersion?: string;
}

export interface SignalEngineOutput {
  signals: ProducedSignal[];
  expired: string[];
  trace: SignalEvaluationTrace[];
  decisionLog: SignalDecisionLog;
}

export function buildSignalId(restaurantId: string, code: string): string {
  return `${restaurantId}:${code}`;
}

export function createProducedSignal(params: {
  restaurantId: string;
  entry: SignalCatalogEntry;
  ruleId: string;
  ruleVersion: string;
  sourceEventIds: string[];
  detectedAt: Date;
  metadata?: Record<string, unknown>;
}): ProducedSignal {
  const {
    restaurantId,
    entry,
    ruleId,
    ruleVersion,
    sourceEventIds,
    detectedAt,
  } = params;
  return {
    id: buildSignalId(restaurantId, entry.code),
    code: entry.code,
    category: entry.category,
    severity: entry.importance,
    direction: entry.direction,
    restaurantId,
    status: 'active',
    detectedAt,
    sourceEventIds,
    explanation: entry.explanationTemplate,
    metadata: params.metadata ?? {},
    ruleVersion,
    ruleId,
    primaryJob: entry.primaryJob,
    dimension: entry.dimension,
  };
}
