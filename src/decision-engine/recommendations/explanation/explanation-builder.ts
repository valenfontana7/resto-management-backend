import { explainStrategyChoice } from '../catalog/strategy-catalog.loader';
import type { DetectedRecommendation } from '../types/recommendation.types';
import type { DecisionExplanation } from '../types/decision-explanation.types';
import type { RestaurantSuccessSnapshot } from '../../rss/types/restaurant-success-snapshot.types';

export function buildDecisionExplanation(
  snapshot: RestaurantSuccessSnapshot,
  recommendations: DetectedRecommendation[],
): DecisionExplanation {
  const primary = recommendations[0] ?? null;

  return {
    score: {
      value: snapshot.rss.value,
      band: snapshot.rss.band,
      delta7d: snapshot.rss.delta7d,
      headline: snapshot.explanation.headline,
    },
    whyNow: {
      factors: snapshot.topFactors.map((f) => ({
        signalCode: f.signalCode,
        label: f.label,
        direction: f.direction,
        weight: f.weight,
      })),
    },
    whatToDo: {
      primaryRecommendationCode: primary?.code ?? null,
      alternatives: recommendations.slice(1).map((r) => r.code),
    },
    trace: {
      signalIds: [
        ...new Set(recommendations.flatMap((r) => r.signalIds)),
      ].sort(),
      opportunityIds: [
        ...new Set(recommendations.flatMap((r) => r.opportunityIds)),
      ].sort(),
      recommendationIds: recommendations.map((r) => r.code).sort(),
      rulesApplied: recommendations.map((r) => r.ruleId).sort(),
      principles: [
        ...new Set(recommendations.flatMap((r) => r.principles)),
      ].sort(),
    },
  };
}

export function buildRecommendationExplanation(
  whyTemplate: string,
  opportunityCode: string | null,
  strategyId: DetectedRecommendation['strategy'],
  priorityExplanation: string,
  confidenceExplanation: string,
  expectedOutcome: string,
): string {
  return [
    `¿Por qué se recomienda? ${whyTemplate}`,
    opportunityCode
      ? `¿Qué Opportunity la originó? ${opportunityCode}.`
      : 'Originada desde patrón de oportunidad activa.',
    priorityExplanation,
    confidenceExplanation,
    explainStrategyChoice(strategyId),
    `¿Qué resultado espera Bentoo? ${expectedOutcome}`,
  ].join(' ');
}
