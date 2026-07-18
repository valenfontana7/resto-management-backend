import {
  bandForScore,
  type ActivationScoreBand,
} from '../restaurants/services/activation-score';

export type ActivationScoreDistribution = Record<ActivationScoreBand, number>;

export interface ParsedActivationSlice {
  firstValueAt: string | null;
  firstValueType: string | null;
  secondSessionAt: string | null;
  scoreBand: ActivationScoreBand | null;
  score: number | null;
  realOpsActionAt: string | null;
}

export interface CohortRestaurantRow {
  id: string;
  createdAt: Date;
  businessRules: unknown;
}

export interface Gen2MetricsResult {
  medianTtfvMinutes: number | null;
  ttfvP75Minutes: number | null;
  ttfvSampleSize: number;
  acr24hPercent: number | null;
  acr7dPercent: number | null;
  wowMomentRatePercent: number | null;
  secondSessionRatePercent: number | null;
  scoreDistribution: ActivationScoreDistribution;
  highRetentionSignalCount: number;
}

const MS_PER_MINUTE = 60_000;
const MS_3D = 3 * 24 * 60 * MS_PER_MINUTE;
const TTFV_HIGH_RETENTION_MAX_MINUTES = 10;

const SCORE_BANDS: ActivationScoreBand[] = [
  'cold',
  'warming',
  'activated',
  'confident',
];

export function parseActivationFromBusinessRules(
  businessRules: unknown,
): ParsedActivationSlice {
  const empty: ParsedActivationSlice = {
    firstValueAt: null,
    firstValueType: null,
    secondSessionAt: null,
    scoreBand: null,
    score: null,
    realOpsActionAt: null,
  };

  if (!businessRules || typeof businessRules !== 'object') return empty;

  const onboarding = (businessRules as Record<string, unknown>).onboarding;
  if (!onboarding || typeof onboarding !== 'object') return empty;

  const activation = (onboarding as Record<string, unknown>).activation;
  if (!activation || typeof activation !== 'object') return empty;

  const row = activation as Record<string, unknown>;
  const milestones =
    row.milestones && typeof row.milestones === 'object'
      ? (row.milestones as Record<string, unknown>)
      : null;

  const scoreBand = parseScoreBand(row.scoreBand);
  const score =
    typeof row.score === 'number' && Number.isFinite(row.score)
      ? row.score
      : null;

  return {
    firstValueAt: parseIsoDate(row.firstValueAt),
    firstValueType:
      typeof row.firstValueType === 'string' && row.firstValueType.length > 0
        ? row.firstValueType
        : null,
    secondSessionAt: parseIsoDate(row.secondSessionAt),
    scoreBand: scoreBand ?? (score != null ? bandForScore(score) : null),
    score,
    realOpsActionAt: milestones
      ? parseIsoDate(milestones.real_ops_action)
      : null,
  };
}

function parseIsoDate(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? value : null;
}

function parseScoreBand(value: unknown): ActivationScoreBand | null {
  if (typeof value !== 'string') return null;
  return SCORE_BANDS.includes(value as ActivationScoreBand)
    ? (value as ActivationScoreBand)
    : null;
}

function roundPercent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function roundMinutes(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function minutesBetween(start: Date, isoEnd: string): number | null {
  const endMs = Date.parse(isoEnd);
  if (!Number.isFinite(endMs)) return null;
  const deltaMs = endMs - start.getTime();
  if (deltaMs < 0) return null;
  return deltaMs / MS_PER_MINUTE;
}

export function computeGen2MetricsFromCohort(
  restaurants: CohortRestaurantRow[],
): Gen2MetricsResult {
  const cohortSize = restaurants.length;
  const ttfvMinutes: number[] = [];
  let acr24h = 0;
  let acr7d = 0;
  let wowMoment = 0;
  let secondSession = 0;
  let secondSessionDenominator = 0;
  let highRetentionSignalCount = 0;

  const scoreDistribution: ActivationScoreDistribution = {
    cold: 0,
    warming: 0,
    activated: 0,
    confident: 0,
  };

  for (const restaurant of restaurants) {
    const activation = parseActivationFromBusinessRules(
      restaurant.businessRules,
    );
    const hasWowMoment = Boolean(
      activation.firstValueAt || activation.firstValueType,
    );
    if (hasWowMoment) wowMoment += 1;

    if (activation.scoreBand) {
      scoreDistribution[activation.scoreBand] += 1;
    }

    if (activation.firstValueAt) {
      const minutes = minutesBetween(
        restaurant.createdAt,
        activation.firstValueAt,
      );
      if (minutes != null) {
        ttfvMinutes.push(minutes);
        if (minutes <= 24 * 60) acr24h += 1;
        if (minutes <= 7 * 24 * 60) acr7d += 1;
      }

      secondSessionDenominator += 1;
      if (activation.secondSessionAt) secondSession += 1;

      const firstValueMs = Date.parse(activation.firstValueAt);
      const ttfvMs = firstValueMs - restaurant.createdAt.getTime();
      const hasSecondSession = Boolean(activation.secondSessionAt);
      const ttfvUnder10Min =
        ttfvMs >= 0 && ttfvMs < TTFV_HIGH_RETENTION_MAX_MINUTES * MS_PER_MINUTE;
      const realOpsByD3 =
        activation.realOpsActionAt != null &&
        Date.parse(activation.realOpsActionAt) <=
          restaurant.createdAt.getTime() + MS_3D;

      if (hasSecondSession && ttfvUnder10Min && realOpsByD3) {
        highRetentionSignalCount += 1;
      }
    }
  }

  ttfvMinutes.sort((a, b) => a - b);
  const median = percentile(ttfvMinutes, 0.5);
  const p75 = percentile(ttfvMinutes, 0.75);

  return {
    medianTtfvMinutes: median != null ? roundMinutes(median) : null,
    ttfvP75Minutes: p75 != null ? roundMinutes(p75) : null,
    ttfvSampleSize: ttfvMinutes.length,
    acr24hPercent: roundPercent(acr24h, cohortSize),
    acr7dPercent: roundPercent(acr7d, cohortSize),
    wowMomentRatePercent: roundPercent(wowMoment, cohortSize),
    secondSessionRatePercent: roundPercent(
      secondSession,
      secondSessionDenominator > 0 ? secondSessionDenominator : cohortSize,
    ),
    scoreDistribution,
    highRetentionSignalCount,
  };
}
