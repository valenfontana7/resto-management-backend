import { parseResolutionMetadata } from './resolution-memory';

export const MIN_BENCHMARK_RESTAURANTS = 3;

export interface BenchmarkAggregate {
  situationType: string;
  sampleRestaurants: number;
  medianSuccessRate: number;
  medianOccurrences: number;
  topSummary: string | null;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function aggregateNetworkBenchmarks(
  rows: Array<{
    restaurantId: string;
    occurrenceCount: number;
    summary: string | null;
    metadata: unknown;
  }>,
  situationType: string,
): BenchmarkAggregate | null {
  const filtered = rows.filter((row) => {
    const meta = parseResolutionMetadata(row.metadata);
    return meta?.situationType === situationType;
  });

  const byRestaurant = new Map<string, typeof filtered>();
  for (const row of filtered) {
    const list = byRestaurant.get(row.restaurantId) ?? [];
    list.push(row);
    byRestaurant.set(row.restaurantId, list);
  }

  if (byRestaurant.size < MIN_BENCHMARK_RESTAURANTS) {
    return null;
  }

  const successRates: number[] = [];
  const occurrences: number[] = [];
  const summaries: string[] = [];

  for (const restaurantRows of byRestaurant.values()) {
    const best = restaurantRows.sort(
      (a, b) => b.occurrenceCount - a.occurrenceCount,
    )[0];
    const meta = parseResolutionMetadata(best.metadata);
    if (meta) successRates.push(meta.successRate);
    occurrences.push(best.occurrenceCount);
    if (best.summary) summaries.push(best.summary);
  }

  return {
    situationType,
    sampleRestaurants: byRestaurant.size,
    medianSuccessRate: median(successRates),
    medianOccurrences: Math.round(median(occurrences)),
    topSummary: summaries[0] ?? null,
  };
}

export function formatBenchmarkComparison(
  localRate: number | null,
  networkMedian: number,
): string {
  if (localRate == null) {
    return `Red: ${Math.round(networkMedian * 100)}% éxito mediano`;
  }
  const localPct = Math.round(localRate * 100);
  const networkPct = Math.round(networkMedian * 100);
  if (localPct >= networkPct + 5) {
    return `Tu local ${localPct}% vs red ${networkPct}% — por encima`;
  }
  if (localPct <= networkPct - 5) {
    return `Tu local ${localPct}% vs red ${networkPct}% — hay margen de mejora`;
  }
  return `Tu local ${localPct}% alineado con red ${networkPct}%`;
}
