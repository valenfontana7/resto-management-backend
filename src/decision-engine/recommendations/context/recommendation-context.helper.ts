import type { DetectedOpportunity } from '../../opportunities/types/opportunity.types';
import type { RestaurantSuccessSnapshot } from '../../rss/types/restaurant-success-snapshot.types';
import type { RecommendationEngineContext } from '../types/recommendation.types';
import type { ActiveRecommendationRecord } from '../types/recommendation.types';

export interface RecommendationView {
  opportunities: DetectedOpportunity[];
  opportunitiesByCode: Map<string, DetectedOpportunity>;
  snapshot: RestaurantSuccessSnapshot;
  context: RecommendationEngineContext;
  activeRecommendations: ActiveRecommendationRecord[];
  suppression: string[];
  activeCodes: Set<string>;
  evaluatedAt: Date;
}

export function buildRecommendationView(
  opportunities: DetectedOpportunity[],
  snapshot: RestaurantSuccessSnapshot,
  context: RecommendationEngineContext = {},
  activeRecommendations: ActiveRecommendationRecord[] = [],
): RecommendationView {
  const evaluatedAt = context.evaluatedAt ?? new Date(snapshot.computedAt);
  return {
    opportunities,
    opportunitiesByCode: new Map(opportunities.map((o) => [o.code, o])),
    snapshot,
    context,
    activeRecommendations,
    suppression: context.activeSuppressions ?? [],
    activeCodes: new Set(snapshot.signalsConsidered),
    evaluatedAt,
  };
}

export function findOpportunity(
  view: RecommendationView,
  code: string,
): DetectedOpportunity | undefined {
  return view.opportunitiesByCode.get(code);
}

export function findOpportunityByPattern(
  view: RecommendationView,
  pattern: string,
): DetectedOpportunity | undefined {
  return view.opportunities.find((o) => o.supportingSignals.includes(pattern));
}

export function snapshotHasAnySignalCode(
  view: RecommendationView,
  codes: string[],
): boolean {
  return codes.some((code) => view.activeCodes.has(code));
}

export function resolveSignalIdsFromOpportunity(
  opportunity: DetectedOpportunity,
  restaurantId: string,
): string[] {
  if (opportunity.signalIds.length > 0) {
    return [...opportunity.signalIds].sort();
  }
  const presentCodes = opportunity.supportingSignals.filter(
    (s) => !s.startsWith('absent:'),
  );
  return presentCodes.map((code) => `${restaurantId}:${code}`).sort();
}

export function buildRecommendationId(
  restaurantId: string,
  code: string,
): string {
  return `${restaurantId}:${code}`;
}

export function daysBetween(fromIso: string, to: Date): number {
  const from = new Date(fromIso).getTime();
  return Math.floor((to.getTime() - from) / (24 * 60 * 60 * 1000));
}

export function isChampionBand(view: RecommendationView): boolean {
  return view.snapshot.rss.band === 'champion';
}

export function hasConfigRegression(view: RecommendationView): boolean {
  return view.activeCodes.has('SIG-RSK-02');
}
