import type { RestaurantSignalContext } from '../context/restaurant-signal-context.builder';
import type { DecisionDomainEvent } from '../types/domain-event.types';
import type { EvaluationContext } from '../types/evaluation-context.types';
import type { ProducedSignal } from '../types/signal.types';
import type { SignalCodeValue } from '../catalog/signal-catalog.loader';

export interface SignalEvaluatorContext {
  events: DecisionDomainEvent[];
  context: EvaluationContext;
  restaurantContext: RestaurantSignalContext;
  priorState: ProducedSignal[];
}

export interface SignalEvaluatorResult {
  activated: ProducedSignal | null;
  expiredCodes: SignalCodeValue[];
  reason: string;
  traceEventIds: string[];
}

export interface SignalEvaluator {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly signalCode: SignalCodeValue;
  evaluate(ctx: SignalEvaluatorContext): SignalEvaluatorResult;
}

export const RULE_VERSION = '1.0.0';
