import {
  getRecommendationCatalogEntry,
  type RecommendationCatalogEntry,
  type RecommendationCodeValue,
} from '../catalog/recommendation-catalog.loader';
import {
  deriveRecommendationConfidence,
  explainRecommendationConfidence,
} from '../conditions/confidence.derivation';
import {
  deriveRecommendationPriority,
  explainRecommendationPriority,
} from '../conditions/priority.derivation';
import type { RecommendationView } from '../context/recommendation-context.helper';
import {
  buildRecommendationId,
  findOpportunity,
  findOpportunityByPattern,
  resolveSignalIdsFromOpportunity,
  snapshotHasAnySignalCode,
} from '../context/recommendation-context.helper';
import { buildRecommendationExplanation } from '../explanation/explanation-builder';
import type { DetectedOpportunity } from '../../opportunities/types/opportunity.types';
import type { DetectedRecommendation } from '../types/recommendation.types';
import { RECOMMENDATION_RULE_VERSION } from '../types/recommendation.types';

export interface RecommendationEvaluatorContext {
  view: RecommendationView;
}

export interface RecommendationEvaluatorResult {
  recommendation: DetectedRecommendation | null;
  reason: string;
}

export interface RecommendationEvaluator {
  readonly ruleId: string;
  readonly ruleVersion: string;
  readonly recommendationCode: RecommendationCodeValue;
  evaluate(ctx: RecommendationEvaluatorContext): RecommendationEvaluatorResult;
}

function buildRecommendation(
  entry: RecommendationCatalogEntry,
  opportunity: DetectedOpportunity,
  view: RecommendationView,
): DetectedRecommendation {
  const signalIds = resolveSignalIdsFromOpportunity(
    opportunity,
    view.snapshot.restaurantId,
  );
  const priority = deriveRecommendationPriority(entry, opportunity, view);
  const confidence = deriveRecommendationConfidence(opportunity);
  const priorityExplanation = explainRecommendationPriority(
    priority,
    entry,
    opportunity,
    view,
  );
  const confidenceExplanation = explainRecommendationConfidence(
    confidence,
    opportunity,
  );

  return {
    id: buildRecommendationId(view.snapshot.restaurantId, entry.code),
    code: entry.code,
    strategy: entry.strategy,
    priority,
    confidence,
    title: entry.title,
    summary: entry.summary,
    explanation: buildRecommendationExplanation(
      entry.whyTemplate,
      opportunity.code,
      entry.strategy,
      priorityExplanation,
      confidenceExplanation,
      entry.expectedOutcome,
    ),
    opportunityIds: [opportunity.id],
    signalIds,
    rssDimensions: opportunity.rssDimensions,
    expectedOutcome: entry.expectedOutcome,
    recommendedJourneyType: entry.recommendedJourneyType,
    estimatedImpact: entry.estimatedImpact,
    estimatedEffort: entry.estimatedEffort,
    primaryJob: entry.primaryJob,
    consumerHints: entry.consumerHints,
    principles: entry.principles,
    createdAt: view.evaluatedAt.toISOString(),
    ruleVersion: RECOMMENDATION_RULE_VERSION,
    ruleId: entry.ruleId,
  };
}

function linkedEvaluator(
  code: RecommendationCodeValue,
  extra?: (
    view: RecommendationView,
    opportunity: DetectedOpportunity,
  ) => boolean,
): RecommendationEvaluator {
  const entry = getRecommendationCatalogEntry(code);
  return {
    ruleId: entry.ruleId,
    ruleVersion: RECOMMENDATION_RULE_VERSION,
    recommendationCode: code,
    evaluate(ctx) {
      if (!entry.sourceOpportunityCode) {
        return {
          recommendation: null,
          reason: 'Sin oportunidad fuente en catálogo',
        };
      }
      const opportunity = findOpportunity(
        ctx.view,
        entry.sourceOpportunityCode,
      );
      if (!opportunity) {
        return {
          recommendation: null,
          reason: `${entry.sourceOpportunityCode} no presente`,
        };
      }
      if (extra && !extra(ctx.view, opportunity)) {
        return {
          recommendation: null,
          reason: 'Condición adicional no cumplida',
        };
      }
      if (signalIdsWouldBeEmpty(opportunity, ctx.view)) {
        return {
          recommendation: null,
          reason: 'INV-05: sin signalIds trazables',
        };
      }
      return {
        recommendation: buildRecommendation(entry, opportunity, ctx.view),
        reason: `Producida desde ${opportunity.code}`,
      };
    },
  };
}

function patternEvaluator(
  code: RecommendationCodeValue,
): RecommendationEvaluator {
  const entry = getRecommendationCatalogEntry(code);
  return {
    ruleId: entry.ruleId,
    ruleVersion: RECOMMENDATION_RULE_VERSION,
    recommendationCode: code,
    evaluate(ctx) {
      const pattern = entry.supportingSignalPattern;
      if (!pattern) {
        return { recommendation: null, reason: 'Sin patrón configurado' };
      }
      const opportunity = findOpportunityByPattern(ctx.view, pattern);
      if (!opportunity) {
        return {
          recommendation: null,
          reason: `Ninguna oportunidad con patrón ${pattern}`,
        };
      }
      if (signalIdsWouldBeEmpty(opportunity, ctx.view)) {
        return {
          recommendation: null,
          reason: 'INV-05: sin signalIds trazables',
        };
      }
      return {
        recommendation: buildRecommendation(entry, opportunity, ctx.view),
        reason: `Producida desde patrón ${pattern}`,
      };
    },
  };
}

function signalIdsWouldBeEmpty(
  opportunity: DetectedOpportunity,
  view: RecommendationView,
): boolean {
  return (
    resolveSignalIdsFromOpportunity(opportunity, view.snapshot.restaurantId)
      .length === 0
  );
}

export const RecPub01Evaluator = linkedEvaluator('REC-PUB-01');
export const RecPay01Evaluator = linkedEvaluator('REC-PAY-01');
export const RecTst01Evaluator = linkedEvaluator('REC-TST-01');
export const RecChk01Evaluator = linkedEvaluator('REC-CHK-01');
export const RecRea01Evaluator = linkedEvaluator(
  'REC-REA-01',
  (view) => !view.opportunitiesByCode.has('OPP-RSK-03'),
);
export const RecSav01Evaluator = linkedEvaluator('REC-SAV-01');
export const Rec2pl01Evaluator = linkedEvaluator('REC-2PL-01');
export const RecGol01Evaluator = linkedEvaluator('REC-GOL-01');
export const RecTri01Evaluator = linkedEvaluator('REC-TRI-01');
export const RecGrw01Evaluator = linkedEvaluator('REC-GRW-01');
export const RecCel01Evaluator = linkedEvaluator('REC-CEL-01');

export const RecFix01Evaluator = linkedEvaluator('REC-FIX-01', (view) =>
  snapshotHasAnySignalCode(
    view,
    getRecommendationCatalogEntry('REC-FIX-01').requiresSnapshotSignalCodes ??
      [],
  ),
);

export const RecMnu01Evaluator = patternEvaluator('REC-MNU-01');
export const RecInv01Evaluator = patternEvaluator('REC-INV-01');

export const ALL_RECOMMENDATION_EVALUATORS: RecommendationEvaluator[] = [
  RecPub01Evaluator,
  RecMnu01Evaluator,
  RecPay01Evaluator,
  RecTst01Evaluator,
  RecChk01Evaluator,
  RecRea01Evaluator,
  RecSav01Evaluator,
  RecFix01Evaluator,
  Rec2pl01Evaluator,
  RecInv01Evaluator,
  RecGol01Evaluator,
  RecTri01Evaluator,
  RecGrw01Evaluator,
  RecCel01Evaluator,
];
