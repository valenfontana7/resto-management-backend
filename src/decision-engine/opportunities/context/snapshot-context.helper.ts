import type {
  RssBandId,
  RssDimensionId,
} from '../../rss/catalog/rss-catalog.loader';
import type { RestaurantSuccessSnapshot } from '../../rss/types/restaurant-success-snapshot.types';
import type { OpportunityEngineContext } from '../types/opportunity.types';

const BAND_ORDER: Record<RssBandId, number> = {
  critical: 0,
  at_risk: 1,
  attention: 2,
  healthy: 3,
  champion: 4,
};

const PILLAR_DIMENSIONS: RssDimensionId[] = [
  'configuration',
  'operation',
  'business',
];

export interface SnapshotView {
  snapshot: RestaurantSuccessSnapshot;
  context: OpportunityEngineContext;
  activeCodes: Set<string>;
  evaluatedAt: Date;
}

export function buildSnapshotView(
  snapshot: RestaurantSuccessSnapshot,
  context: OpportunityEngineContext = {},
): SnapshotView {
  const evaluatedAt = context.evaluatedAt ?? new Date(snapshot.computedAt);
  return {
    snapshot,
    context,
    activeCodes: new Set(snapshot.signalsConsidered),
    evaluatedAt,
  };
}

export function hasSignal(view: SnapshotView, code: string): boolean {
  return view.activeCodes.has(code);
}

export function lacksSignal(view: SnapshotView, code: string): boolean {
  return !view.activeCodes.has(code);
}

export function configScore(view: SnapshotView): number {
  return view.snapshot.dimensions.configuration.score;
}

export function countActivePillars(
  view: SnapshotView,
  minimumScore: number,
): number {
  return PILLAR_DIMENSIONS.filter(
    (dim) => view.snapshot.dimensions[dim].score >= minimumScore,
  ).length;
}

export function isSinglePillarActive(
  view: SnapshotView,
  minimumScore: number,
): boolean {
  return countActivePillars(view, minimumScore) === 1;
}

export function isRssBand(view: SnapshotView, bands: RssBandId[]): boolean {
  return bands.includes(view.snapshot.rss.band);
}

export function isBandAtLeast(view: SnapshotView, band: RssBandId): boolean {
  return BAND_ORDER[view.snapshot.rss.band] >= BAND_ORDER[band];
}

export function isBandAtMost(view: SnapshotView, band: RssBandId): boolean {
  return BAND_ORDER[view.snapshot.rss.band] <= BAND_ORDER[band];
}

export function resolveSignalIds(
  view: SnapshotView,
  codes: string[],
): string[] {
  return codes
    .filter((code) => view.activeCodes.has(code))
    .map((code) => `${view.snapshot.restaurantId}:${code}`)
    .sort();
}

export function buildSupportingSignals(
  present: string[],
  absent: string[] = [],
): string[] {
  return [...present, ...absent.map((code) => `absent:${code}`)].sort();
}

export function buildOpportunityId(restaurantId: string, code: string): string {
  return `${restaurantId}:${code}`;
}

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  const diff = to.getTime() - from;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}
