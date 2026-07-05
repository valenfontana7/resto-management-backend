import { Injectable } from '@nestjs/common';
import { getCatalogVersion } from './catalog/signal-catalog.loader';
import { buildRestaurantSignalContext } from './context/restaurant-signal-context.builder';
import { SignalRegistry } from './signal-registry.service';
import {
  DEFAULT_RULE_CATALOG_VERSION,
  type EvaluationContext,
} from './types/evaluation-context.types';
import type { DecisionDomainEvent } from './types/domain-event.types';
import {
  createEmptyDecisionLog,
  type EvaluatorRunLog,
  type SignalDecisionLog,
} from './types/decision-log.types';
import type {
  ProducedSignal,
  SignalEngineInput,
  SignalEngineOutput,
  SignalEvaluationTrace,
} from './types/signal.types';
import type { SignalEvaluatorContext } from './evaluators/signal-evaluator.interface';

@Injectable()
export class SignalEngineService {
  constructor(private readonly registry: SignalRegistry) {}

  evaluate(input: SignalEngineInput): SignalEngineOutput {
    const ruleCatalogVersion =
      input.ruleCatalogVersion ??
      input.context.ruleCatalogVersion ??
      DEFAULT_RULE_CATALOG_VERSION;

    const restaurantContext = buildRestaurantSignalContext(
      input.events,
      input.context,
    );

    const evaluatorContext: SignalEvaluatorContext = {
      events: input.events,
      context: input.context,
      restaurantContext,
      priorState: input.signalState,
    };

    const decisionLog = createEmptyDecisionLog(
      input.context.restaurantId,
      input.context.evaluatedAt,
      ruleCatalogVersion,
    );

    const trace: SignalEvaluationTrace[] = [];
    const expiredSet = new Set<string>();
    const activatedByCode = new Map<string, ProducedSignal>();

    for (const evaluator of this.registry.getEvaluators()) {
      const started = Date.now();
      const result = evaluator.evaluate(evaluatorContext);
      const durationMs = Date.now() - started;

      for (const code of result.expiredCodes) {
        expiredSet.add(code);
        activatedByCode.delete(code);
      }

      if (result.activated) {
        activatedByCode.set(result.activated.code, result.activated);
        expiredSet.delete(result.activated.code);

        for (const eventId of result.traceEventIds) {
          trace.push({
            eventId,
            ruleId: evaluator.ruleId,
            signalCode: result.activated.code,
          });
        }
      }

      const runLog: EvaluatorRunLog = {
        ruleId: evaluator.ruleId,
        ruleVersion: evaluator.ruleVersion,
        signalCode: result.activated?.code ?? evaluator.signalCode,
        fired: result.activated !== null,
        expiredCodes: [...result.expiredCodes],
        reason: result.reason,
        durationMs,
      };
      decisionLog.runs.push(runLog);
      decisionLog.evaluatorsRun += 1;
      if (runLog.fired) {
        decisionLog.evaluatorsFired += 1;
      }
    }

    const signals = [...activatedByCode.values()].sort((a, b) =>
      a.code.localeCompare(b.code),
    );

    decisionLog.summary = this.buildSummary(decisionLog, signals);

    return {
      signals,
      expired: [...expiredSet].sort(),
      trace,
      decisionLog,
    };
  }

  /**
   * Convenience: load prior state from array, evaluate, return output.
   */
  evaluateFromEvents(
    events: DecisionDomainEvent[],
    context: EvaluationContext,
    priorState: ProducedSignal[] = [],
  ): SignalEngineOutput {
    return this.evaluate({
      events,
      signalState: priorState,
      context: {
        ...context,
        ruleCatalogVersion:
          context.ruleCatalogVersion ?? DEFAULT_RULE_CATALOG_VERSION,
      },
      ruleCatalogVersion: context.ruleCatalogVersion,
    });
  }

  getCatalogVersion(): string {
    return getCatalogVersion();
  }

  private buildSummary(
    log: SignalDecisionLog,
    signals: ProducedSignal[],
  ): string {
    const activeCodes = signals.map((s) => s.code).join(', ') || 'none';
    return (
      `Evaluated ${log.evaluatorsRun} rules (${log.evaluatorsFired} fired). ` +
      `Active signals: ${activeCodes}. Catalog v${log.ruleCatalogVersion}.`
    );
  }
}
