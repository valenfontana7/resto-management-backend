import { Injectable } from '@nestjs/common';
import {
  getBandLabel,
  getRssAlgorithmCatalog,
  getRssAlgorithmVersion,
  getRssBandsCatalog,
  getRssWeightsCatalog,
  resolveBand,
  type OverlayRule,
  type SignalBoostRule,
  type RssBandId,
  type RssDimensionId,
} from './catalog/rss-catalog.loader';
import { DimensionRegistry } from './dimension-registry.service';
import type {
  DimensionEvaluationResult,
  RestaurantSuccessSnapshot,
  RssDecisionLog,
  RssEngineContext,
  RssEngineInput,
  RssEngineOutput,
  RssExplanation,
  SignalFactor,
} from './types/restaurant-success-snapshot.types';
import type { ProducedSignal } from '../signals/types/signal.types';
import { getSignalCatalogEntry } from '../signals/catalog/signal-catalog.loader';

@Injectable()
export class RssAggregatorService {
  constructor(private readonly dimensionRegistry: DimensionRegistry) {}

  aggregate(input: RssEngineInput): RssEngineOutput {
    const algorithm = getRssAlgorithmCatalog();
    const activeCodes = new Set(
      input.signals.filter((s) => s.status === 'active').map((s) => s.code),
    );
    const activeSignals = input.signals.filter((s) => s.status === 'active');

    const dimensionResults: Record<RssDimensionId, DimensionEvaluationResult> =
      {} as Record<RssDimensionId, DimensionEvaluationResult>;

    const evaluatorIds: string[] = [];

    for (const evaluator of this.dimensionRegistry.getEvaluators()) {
      evaluatorIds.push(evaluator.dimensionId);
      dimensionResults[evaluator.dimensionId] = evaluator.evaluate({
        signals: activeSignals,
        context: input.context,
        activeCodes,
      });
    }

    this.applySignalBoosts(
      dimensionResults,
      activeCodes,
      input.context,
      algorithm,
    );

    let rawRss = 0;
    for (const dim of Object.values(dimensionResults)) {
      rawRss += dim.score * dim.rssWeight;
    }
    rawRss = Math.round(rawRss);

    const { finalRss, overlaysApplied, bandOverride } = this.applyOverlays(
      rawRss,
      activeCodes,
      input.context,
      algorithm.overlays,
    );

    const band: RssBandId = bandOverride ?? resolveBand(finalRss);
    const topFactors = this.buildTopFactors(
      dimensionResults,
      algorithm.topFactorsLimit,
    );
    const explanation = this.buildExplanation(dimensionResults, finalRss, band);
    const { delta7d, delta30d, trend7d } = this.computeDeltas(
      finalRss,
      input.historicalSnapshots ?? [],
      input.context.evaluatedAt,
    );

    const signalsConsidered = [...activeCodes].sort();
    const primaryJob = this.inferPrimaryJob(activeSignals, dimensionResults);

    const snapshot: RestaurantSuccessSnapshot = {
      restaurantId: input.context.restaurantId,
      computedAt: input.context.evaluatedAt.toISOString(),
      algorithmVersion: getRssAlgorithmVersion(),
      modelVersion: input.context.modelVersion,
      weightsCatalogVersion: getRssWeightsCatalog().version,
      bandsCatalogVersion: getRssBandsCatalog().version,
      rss: {
        value: finalRss,
        band,
        bandLabel: getBandLabel(band),
        delta7d,
        delta30d,
        trend7d,
      },
      dimensions: dimensionResults,
      topFactors,
      explanation,
      signalsConsidered,
      signalIds: activeSignals.map((s) => s.id).sort(),
      overlaysApplied,
      primaryJob,
      metadata: {
        intent: input.context.intent,
        tenureDays: input.context.tenureDays,
        traceability: {
          algorithmVersion: getRssAlgorithmVersion(),
          weightsVersion: getRssWeightsCatalog().version,
          bandsVersion: getRssBandsCatalog().version,
          signalsCount: activeSignals.length,
        },
      },
    };

    const decisionLog: RssDecisionLog = {
      restaurantId: input.context.restaurantId,
      evaluatedAt: input.context.evaluatedAt.toISOString(),
      algorithmVersion: getRssAlgorithmVersion(),
      dimensionEvaluatorsRun: evaluatorIds,
      overlaysApplied,
      rawRssBeforeOverlays: rawRss,
      finalRss,
      summary: `RSS ${finalRss} (${getBandLabel(band)}). Raw ${rawRss}. Overlays: ${overlaysApplied.join(', ') || 'none'}.`,
    };

    return { snapshot, decisionLog };
  }

  private applyOverlays(
    rawRss: number,
    activeCodes: Set<string>,
    context: RssEngineContext,
    overlays: OverlayRule[],
  ): {
    finalRss: number;
    overlaysApplied: string[];
    bandOverride: RssBandId | null;
  } {
    let finalRss = rawRss;
    const overlaysApplied: string[] = [];
    let bandOverride: RssBandId | null = null;

    for (const overlay of overlays) {
      const codes =
        overlay.signalCodes ?? (overlay.signalCode ? [overlay.signalCode] : []);
      const matches = codes.some((c) => activeCodes.has(c));
      if (!matches) continue;

      if (
        overlay.minTenureDays !== undefined &&
        context.tenureDays < overlay.minTenureDays
      ) {
        continue;
      }

      if (overlay.maxRss !== undefined && finalRss > overlay.maxRss) {
        finalRss = overlay.maxRss;
        overlaysApplied.push(overlay.id);
      }

      if (
        overlay.maxBandScore !== undefined &&
        finalRss > overlay.maxBandScore
      ) {
        finalRss = overlay.maxBandScore;
        overlaysApplied.push(overlay.id);
      }

      if (overlay.forceBand) {
        bandOverride = overlay.forceBand;
        overlaysApplied.push(overlay.id);
      }
    }

    return {
      finalRss: Math.max(0, Math.min(100, finalRss)),
      overlaysApplied,
      bandOverride,
    };
  }

  private applySignalBoosts(
    dimensions: Record<RssDimensionId, DimensionEvaluationResult>,
    activeCodes: Set<string>,
    context: RssEngineContext,
    algorithm: ReturnType<typeof getRssAlgorithmCatalog>,
  ): void {
    for (const boost of algorithm.signalBoosts ?? []) {
      if (!this.boostMatches(boost, activeCodes, context)) continue;

      if (boost.dimension && boost.minimumScore !== undefined) {
        const dim = dimensions[boost.dimension];
        dim.score = Math.max(dim.score, boost.minimumScore);
      }

      if (boost.dimensionBoosts) {
        for (const [dimId, minScore] of Object.entries(boost.dimensionBoosts)) {
          const dim = dimensions[dimId as RssDimensionId];
          dim.score = Math.max(dim.score, minScore);
        }
      }
    }
  }

  private boostMatches(
    boost: SignalBoostRule,
    activeCodes: Set<string>,
    context: RssEngineContext,
  ): boolean {
    const allRequired = boost.requiredActiveSignals.every((c) =>
      activeCodes.has(c),
    );
    if (!allRequired) return false;

    if (
      boost.whenMaxTenureDays !== undefined &&
      context.tenureDays > boost.whenMaxTenureDays
    ) {
      return false;
    }

    if (
      boost.whenSignalActive !== undefined &&
      !activeCodes.has(boost.whenSignalActive)
    ) {
      return false;
    }

    return true;
  }

  private buildTopFactors(
    dimensions: Record<RssDimensionId, DimensionEvaluationResult>,
    limit: number,
  ): SignalFactor[] {
    const all = Object.values(dimensions).flatMap(
      (d) => d.explanation.influencingSignals,
    );
    return all
      .sort((a, b) => Math.abs(b.impactPoints) - Math.abs(a.impactPoints))
      .slice(0, limit);
  }

  private buildExplanation(
    dimensions: Record<RssDimensionId, DimensionEvaluationResult>,
    rss: number,
    band: RssBandId,
  ): RssExplanation {
    const dimensionSummaries = Object.values(dimensions).map((d) => ({
      dimensionId: d.dimensionId,
      label: d.label,
      score: d.score,
      why: d.explanation.why,
    }));

    const improvementPriorities = Object.values(dimensions)
      .filter((d) => d.score < 75)
      .sort((a, b) => a.score - b.score)
      .map((d) => d.explanation.improvementHint)
      .slice(0, 3);

    return {
      headline: `RSS ${rss} — ${getBandLabel(band)}`,
      summary: `El restaurante obtiene ${rss}/100 en creación de valor Bentoo (banda ${getBandLabel(band)}).`,
      dimensionSummaries,
      improvementPriorities,
    };
  }

  private inferPrimaryJob(
    signals: ProducedSignal[],
    dimensions: Record<RssDimensionId, DimensionEvaluationResult>,
  ): string | null {
    const negative = signals.find((s) => s.direction === 'negative');
    if (negative) return negative.primaryJob;

    for (const dim of Object.values(dimensions)) {
      if (dim.internalOpportunities.length > 0) {
        const code = dim.internalOpportunities[0].replace(
          'internal:missing_signal:',
          '',
        );
        try {
          return getSignalCatalogEntry(code as never).primaryJob;
        } catch {
          /* continue */
        }
      }
    }

    const positive = signals.find((s) => s.direction === 'positive');
    return positive?.primaryJob ?? null;
  }

  private computeDeltas(
    currentRss: number,
    history: RestaurantSuccessSnapshot[],
    evaluatedAt: Date,
  ): {
    delta7d: number | null;
    delta30d: number | null;
    trend7d: 'up' | 'stable' | 'down' | null;
  } {
    const ms7 = 7 * 24 * 60 * 60 * 1000;
    const ms30 = 30 * 24 * 60 * 60 * 1000;
    const t = evaluatedAt.getTime();

    const snap7 = this.findClosestSnapshot(history, t - ms7);
    const snap30 = this.findClosestSnapshot(history, t - ms30);

    const delta7d = snap7 ? currentRss - snap7.rss.value : null;
    const delta30d = snap30 ? currentRss - snap30.rss.value : null;

    let trend7d: 'up' | 'stable' | 'down' | null = null;
    if (delta7d !== null) {
      if (delta7d >= 5) trend7d = 'up';
      else if (delta7d <= -5) trend7d = 'down';
      else trend7d = 'stable';
    }

    return { delta7d, delta30d, trend7d };
  }

  private findClosestSnapshot(
    history: RestaurantSuccessSnapshot[],
    targetTime: number,
  ): RestaurantSuccessSnapshot | null {
    if (history.length === 0) return null;
    const sorted = [...history].sort(
      (a, b) =>
        new Date(a.computedAt).getTime() - new Date(b.computedAt).getTime(),
    );
    let best: RestaurantSuccessSnapshot | null = null;
    for (const snap of sorted) {
      const ts = new Date(snap.computedAt).getTime();
      if (ts <= targetTime) best = snap;
      else break;
    }
    return best;
  }
}

@Injectable()
export class RssEngineService {
  constructor(private readonly aggregator: RssAggregatorService) {}

  evaluate(input: RssEngineInput): RssEngineOutput {
    const activeOnly = input.signals.filter((s) => s.status === 'active');
    return this.aggregator.aggregate({
      ...input,
      signals: activeOnly,
    });
  }
}
