import {
  getImportancePoints,
  getRequiredSignalsForIntent,
  getRssAlgorithmCatalog,
  getSignalLabel,
  getSignalsForDimension,
  isSignalIgnoredForIntent,
  type RssDimensionId,
} from '../catalog/rss-catalog.loader';
import { getSignalCatalogEntry } from '../../signals/catalog/signal-catalog.loader';
import type { ProducedSignal } from '../../signals/types/signal.types';
import type {
  DimensionEvaluationResult,
  DimensionExplanation,
  SignalFactor,
} from '../types/restaurant-success-snapshot.types';
import type {
  DimensionEvaluator,
  DimensionEvaluatorInput,
} from './dimension-evaluator.interface';

function importanceToWeight(severity: string): SignalFactor['weight'] {
  if (severity === 'P0') return 'high';
  if (severity === 'P1') return 'medium';
  return 'low';
}

export abstract class BaseDimensionEvaluator implements DimensionEvaluator {
  abstract readonly dimensionId: RssDimensionId;

  evaluate(input: DimensionEvaluatorInput): DimensionEvaluationResult {
    const algorithm = getRssAlgorithmCatalog();
    const dimConfig = algorithm.dimensions[this.dimensionId];
    const activeInDimension = input.signals.filter((s) => {
      const entry = getSignalCatalogEntry(s.code as never);
      return (
        entry.dimension === this.dimensionId ||
        this.mapsSignalToDimension(s.code)
      );
    });

    const activeCodes = new Set(activeInDimension.map((s) => s.code));
    const required = getRequiredSignalsForIntent(
      input.context.intent,
      this.dimensionId,
    ).filter((code) => !isSignalIgnoredForIntent(input.context.intent, code));

    const applicableCodes = getSignalsForDimension(this.dimensionId).filter(
      (code) => !isSignalIgnoredForIntent(input.context.intent, code),
    );

    if (
      applicableCodes.length === 0 &&
      dimConfig.neutralScoreWhenNoApplicableSignals !== undefined
    ) {
      return this.buildResult(
        dimConfig.neutralScoreWhenNoApplicableSignals,
        [],
        required,
        activeCodes,
        input,
        'Sin señales aplicables para esta dimensión en el intent actual.',
      );
    }

    if (dimConfig.scoringMode === 'risk_inverted') {
      return this.evaluateRiskInverted(input, activeInDimension, required);
    }

    return this.evaluateStandard(
      input,
      activeInDimension,
      required,
      activeCodes,
    );
  }

  protected mapsSignalToDimension(code: string): boolean {
    void code;
    return false;
  }

  private evaluateStandard(
    input: DimensionEvaluatorInput,
    activeInDimension: ProducedSignal[],
    required: string[],
    activeCodes: Set<string>,
  ): DimensionEvaluationResult {
    const algorithm = getRssAlgorithmCatalog();
    let maxPoints = 0;
    let earnedPoints = 0;
    let penaltyPoints = 0;
    const factors: SignalFactor[] = [];

    for (const code of required) {
      const entry = getSignalCatalogEntry(code as never);
      if (entry.direction !== 'positive') continue;
      const pts = getImportancePoints(entry.importance);
      maxPoints += pts;
      if (activeCodes.has(code)) {
        earnedPoints += pts;
        factors.push({
          signalCode: code,
          label: entry.description,
          direction: 'positive',
          weight: importanceToWeight(entry.importance),
          impactPoints: pts,
        });
      } else {
        penaltyPoints += pts * algorithm.missingRequiredMultiplier;
      }
    }

    for (const signal of activeInDimension) {
      const entry = getSignalCatalogEntry(signal.code as never);
      if (entry.direction === 'negative' && activeCodes.has(signal.code)) {
        const pts =
          getImportancePoints(entry.importance) *
          algorithm.negativePenaltyMultiplier;
        penaltyPoints += pts;
        factors.push({
          signalCode: signal.code,
          label: entry.description,
          direction: 'negative',
          weight: importanceToWeight(entry.importance),
          impactPoints: -pts,
        });
      }
      if (
        entry.direction === 'positive' &&
        activeCodes.has(signal.code) &&
        !required.includes(signal.code)
      ) {
        const pts = getImportancePoints(entry.importance);
        earnedPoints += pts;
        maxPoints += pts;
        factors.push({
          signalCode: signal.code,
          label: entry.description,
          direction: 'positive',
          weight: importanceToWeight(entry.importance),
          impactPoints: pts,
        });
      }
    }

    if (maxPoints === 0) {
      maxPoints = 1;
    }

    const raw = ((earnedPoints - penaltyPoints) / maxPoints) * 100;
    const score = Math.max(0, Math.min(100, Math.round(raw)));

    return this.buildResult(
      score,
      factors,
      required,
      activeCodes,
      input,
      this.buildWhyStandard(score, factors, required, activeCodes),
    );
  }

  private evaluateRiskInverted(
    input: DimensionEvaluatorInput,
    activeInDimension: ProducedSignal[],
    required: string[],
  ): DimensionEvaluationResult {
    void required;
    const algorithm = getRssAlgorithmCatalog();
    let penaltyPoints = 0;
    const factors: SignalFactor[] = [];

    for (const signal of activeInDimension) {
      const entry = getSignalCatalogEntry(signal.code as never);
      if (entry.direction === 'negative') {
        const pts =
          getImportancePoints(entry.importance) *
          algorithm.negativePenaltyMultiplier;
        penaltyPoints += pts;
        factors.push({
          signalCode: signal.code,
          label: entry.description,
          direction: 'negative',
          weight: importanceToWeight(entry.importance),
          impactPoints: -pts,
        });
      }
    }

    const score = Math.max(0, Math.min(100, Math.round(100 - penaltyPoints)));

    return this.buildResult(
      score,
      factors,
      [],
      new Set(activeInDimension.map((s) => s.code)),
      input,
      score >= 75
        ? 'Sin señales de riesgo material activas.'
        : 'Hay señales de riesgo que reducen la confianza en la relación.',
    );
  }

  private buildWhyStandard(
    score: number,
    factors: SignalFactor[],
    required: string[],
    activeCodes: Set<string>,
  ): string {
    if (score >= 75) {
      return 'La dimensión cumple los hitos de valor esperados para el intent.';
    }
    const missing = required.filter(
      (c) =>
        !activeCodes.has(c) &&
        getSignalCatalogEntry(c as never).direction === 'positive',
    );
    if (missing.length > 0) {
      return `Faltan hitos: ${missing.map(getSignalLabel).join('; ')}.`;
    }
    const negatives = factors.filter((f) => f.direction === 'negative');
    if (negatives.length > 0) {
      return `Penaliza: ${negatives.map((f) => f.label).join('; ')}.`;
    }
    return 'Progreso parcial respecto a los hitos esperados.';
  }

  private buildResult(
    score: number,
    factors: SignalFactor[],
    required: string[],
    activeCodes: Set<string>,
    input: DimensionEvaluatorInput,
    why: string,
  ): DimensionEvaluationResult {
    const dimConfig = getRssAlgorithmCatalog().dimensions[this.dimensionId];
    const missing = required.filter(
      (c) =>
        !activeCodes.has(c) &&
        getSignalCatalogEntry(c as never).direction === 'positive',
    );

    const improvementHint =
      missing.length > 0
        ? `Priorizar: ${missing.map(getSignalLabel).join(', ')}.`
        : factors.some((f) => f.direction === 'negative')
          ? 'Resolver las señales negativas activas en esta dimensión.'
          : 'Consolidar el hábito para sostener el valor obtenido.';

    const internalOpportunities = missing.map(
      (code) => `internal:missing_signal:${code}`,
    );

    const explanation: DimensionExplanation = {
      why,
      influencingSignals: factors,
      improvementHint,
    };

    return {
      dimensionId: this.dimensionId,
      label: dimConfig.label,
      score,
      rssWeight: dimConfig.rssWeight,
      explanation,
      signalsUsed: [...activeCodes].sort(),
      internalOpportunities,
    };
  }
}
