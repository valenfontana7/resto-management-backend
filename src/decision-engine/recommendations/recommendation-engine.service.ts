import { Injectable } from '@nestjs/common';
import {
  getMaxActiveRecommendations,
  getMaxCriticalRecommendations,
  getRecommendationCatalogVersion,
  getRecommendationExpireDays,
  type RecommendationPriority,
} from './catalog/recommendation-catalog.loader';
import { checkRecommendationSuppression } from './conditions/suppression';
import {
  buildRecommendationView,
  daysBetween,
} from './context/recommendation-context.helper';
import { buildDecisionExplanation } from './explanation/explanation-builder';
import { RecommendationRegistry } from './recommendation-registry.service';
import {
  createEmptyRecommendationDecisionLog,
  type RecommendationDecisionLog,
  type RecommendationEvaluatorRunLog,
  type RecommendationTransitionLog,
} from './types/recommendation-decision-log.types';
import type {
  ActiveRecommendationRecord,
  DetectedRecommendation,
  RecommendationEngineInput,
  RecommendationEngineOutput,
} from './types/recommendation.types';
import { getRecommendationCatalogEntry } from './catalog/recommendation-catalog.loader';

const PRIORITY_ORDER: Record<RecommendationPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

@Injectable()
export class RecommendationEngineService {
  constructor(private readonly registry: RecommendationRegistry) {}

  evaluate(input: RecommendationEngineInput): RecommendationEngineOutput {
    const view = buildRecommendationView(
      input.opportunities,
      input.snapshot,
      input.context,
      input.activeRecommendations ?? [],
    );
    const catalogVersion = getRecommendationCatalogVersion();
    const maxActive = getMaxActiveRecommendations();
    const maxCritical = getMaxCriticalRecommendations();
    const expireDays = getRecommendationExpireDays();

    const decisionLog = createEmptyRecommendationDecisionLog(
      input.snapshot.restaurantId,
      view.evaluatedAt,
      catalogVersion,
    );

    const activeByCode = new Map(
      (input.activeRecommendations ?? []).map((r) => [r.code, r]),
    );

    const expired: string[] = [];
    const superseded: string[] = [];

    for (const active of input.activeRecommendations ?? []) {
      const stillValid =
        active.opportunityIds.length === 0 ||
        active.opportunityIds.every((id) =>
          input.opportunities.some((o) => o.id === id),
        );

      if (!stillValid) {
        superseded.push(active.id);
        activeByCode.delete(active.code);
        continue;
      }

      if (daysBetween(active.activatedAt, view.evaluatedAt) >= expireDays) {
        expired.push(active.id);
        activeByCode.delete(active.code);
      }
    }

    const candidates: DetectedRecommendation[] = [];

    for (const evaluator of this.registry.getEvaluators()) {
      const started = Date.now();
      const entry = getRecommendationCatalogEntry(evaluator.recommendationCode);
      const suppression = checkRecommendationSuppression(entry, view);
      let result = evaluator.evaluate({ view });
      let discarded = false;
      let discardReason: string | undefined;

      if (suppression.suppressed) {
        discarded = true;
        discardReason = suppression.reason ?? 'Recomendación suprimida';
        result = { recommendation: null, reason: discardReason };
      } else if (result.recommendation) {
        if (result.recommendation.signalIds.length < 1) {
          discarded = true;
          discardReason = 'INV-05: signalIds vacío';
          result = { recommendation: null, reason: discardReason };
        } else {
          candidates.push(result.recommendation);
        }
      }

      const runLog: RecommendationEvaluatorRunLog = {
        ruleId: evaluator.ruleId,
        ruleVersion: evaluator.ruleVersion,
        recommendationCode: evaluator.recommendationCode,
        produced: result.recommendation !== null && !discarded,
        discarded,
        discardReason,
        reason: discardReason ?? result.reason,
        durationMs: Date.now() - started,
      };
      decisionLog.runs.push(runLog);
      decisionLog.evaluatorsRun += 1;
      if (runLog.produced) {
        decisionLog.evaluatorsProduced += 1;
      }
      if (discarded) {
        decisionLog.evaluatorsDiscarded += 1;
      }
    }

    const newCandidates = candidates.filter((c) => !activeByCode.has(c.code));
    const sorted = [...newCandidates].sort((a, b) =>
      this.compareRecommendations(a, b),
    );

    const selected: DetectedRecommendation[] = [];
    const backlog: DetectedRecommendation[] = [];
    let criticalCount = [...activeByCode.values()].filter(
      (r) => r.priority === 'critical',
    ).length;

    for (const rec of sorted) {
      const slotsLeft = maxActive - activeByCode.size - selected.length;
      if (slotsLeft <= 0) {
        backlog.push(rec);
        continue;
      }
      if (rec.priority === 'critical' && criticalCount >= maxCritical) {
        backlog.push(rec);
        continue;
      }
      selected.push(rec);
      if (rec.priority === 'critical') {
        criticalCount += 1;
      }
    }

    const transitions: RecommendationTransitionLog[] = [];

    for (const rec of selected) {
      transitions.push({
        transition: 'recommendation_created',
        recommendationId: rec.id,
        code: rec.code,
        reason: rec.explanation,
        ruleId: rec.ruleId,
      });
    }

    for (const rec of backlog) {
      transitions.push({
        transition: 'recommendation_backlogged',
        recommendationId: rec.id,
        code: rec.code,
        reason: `Límite de ${maxActive} recomendaciones activas`,
        ruleId: rec.ruleId,
      });
    }

    for (const id of expired) {
      const code = id.split(':').slice(1).join(':');
      transitions.push({
        transition: 'recommendation_expired',
        recommendationId: id,
        code,
        reason: `Stale >${expireDays}d`,
        ruleId: getRecommendationCatalogEntry(code as never).ruleId,
      });
    }

    for (const id of superseded) {
      const code = id.split(':').slice(1).join(':');
      transitions.push({
        transition: 'recommendation_superseded',
        recommendationId: id,
        code,
        reason: 'Oportunidad origen cerrada',
        ruleId: getRecommendationCatalogEntry(code as never).ruleId,
      });
    }

    decisionLog.transitions = transitions;
    decisionLog.summary = this.buildSummary(
      decisionLog,
      selected.length,
      backlog.length,
    );

    const activeRecommendations: ActiveRecommendationRecord[] = [
      ...activeByCode.values(),
      ...selected.map((rec) => ({
        ...rec,
        activatedAt: rec.createdAt,
        status: 'active' as const,
      })),
    ].sort((a, b) => this.compareRecommendations(a, b));

    const recommendations = activeRecommendations.map((rec) => {
      const { activatedAt, status, ...rest } = rec;
      void activatedAt;
      void status;
      return rest;
    });

    return {
      recommendations,
      backlog,
      expired,
      superseded,
      activeRecommendations,
      explanation: buildDecisionExplanation(input.snapshot, recommendations),
      decisionLog,
    };
  }

  private compareRecommendations(
    a: DetectedRecommendation,
    b: DetectedRecommendation,
  ): number {
    const priorityDiff =
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return a.code.localeCompare(b.code);
  }

  private buildSummary(
    log: RecommendationDecisionLog,
    created: number,
    backlog: number,
  ): string {
    return `Evaluators: ${log.evaluatorsRun} run, ${log.evaluatorsProduced} produced, ${log.evaluatorsDiscarded} discarded. Active new: ${created}, backlog: ${backlog}.`;
  }
}
