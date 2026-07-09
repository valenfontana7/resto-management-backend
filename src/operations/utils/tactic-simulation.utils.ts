export interface EpisodeOutcomeRow {
  situationType?: string | null;
  outcome: {
    status?: string;
    summary?: string | null;
    measuredImpact?: {
      metric: string;
      valueBefore?: number;
      valueAfter?: number;
      unit?: string;
    } | null;
  };
  closedAt?: Date | null;
}

export interface SimulationProjection {
  situationType: string;
  tacticSummary: string;
  sampleSize: number;
  matchedEpisodes: number;
  medianDelta: number | null;
  metric: string | null;
  unit: string | null;
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  narrative: string;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

export function matchesTactic(
  summary: string | null | undefined,
  tacticSummary: string,
): boolean {
  if (!summary?.trim()) return false;
  const needle = normalizeText(tacticSummary);
  const hay = normalizeText(summary);
  return (
    hay.includes(needle) ||
    needle
      .split(/\s+/)
      .slice(0, 3)
      .every((w) => hay.includes(w))
  );
}

export function computeMedianDelta(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function projectTacticSimulation(input: {
  situationType: string;
  tacticSummary: string;
  episodes: EpisodeOutcomeRow[];
  dayOfWeek?: number;
  hour?: number;
}): SimulationProjection {
  const filtered = input.episodes.filter((episode) => {
    if (episode.situationType !== input.situationType) return false;
    if (input.dayOfWeek != null && episode.closedAt) {
      if (episode.closedAt.getDay() !== input.dayOfWeek) return false;
    }
    if (input.hour != null && episode.closedAt) {
      if (episode.closedAt.getHours() !== input.hour) return false;
    }
    return true;
  });

  const matched = filtered.filter((episode) =>
    matchesTactic(episode.outcome.summary, input.tacticSummary),
  );

  const deltas = matched
    .map((episode) => {
      const impact = episode.outcome.measuredImpact;
      if (
        impact?.valueBefore == null ||
        impact?.valueAfter == null ||
        !Number.isFinite(impact.valueBefore) ||
        !Number.isFinite(impact.valueAfter)
      ) {
        return null;
      }
      return impact.valueAfter - impact.valueBefore;
    })
    .filter((value): value is number => value != null);

  const medianDelta = computeMedianDelta(deltas);
  const metric =
    matched.find((m) => m.outcome.measuredImpact?.metric)?.outcome
      .measuredImpact?.metric ?? null;
  const unit =
    matched.find((m) => m.outcome.measuredImpact?.unit)?.outcome.measuredImpact
      ?.unit ?? null;

  const confidence: SimulationProjection['confidence'] =
    matched.length >= 8 ? 'HIGH' : matched.length >= 3 ? 'MEDIUM' : 'LOW';

  let narrative: string;
  if (matched.length === 0) {
    narrative =
      'Sin episodios locales con esta táctica todavía. Necesitás más resoluciones medidas para simular.';
  } else if (medianDelta == null) {
    narrative = `Hay ${matched.length} caso(s) con esta táctica, pero sin impacto numérico registrado.`;
  } else {
    const direction =
      medianDelta < 0 ? 'mejora' : medianDelta > 0 ? 'empeora' : 'neutro';
    narrative = `Impacto mediano estimado ${medianDelta > 0 ? '+' : ''}${medianDelta}${unit ? ` ${unit}` : ''} (${direction}) en ${matched.length} episodio(s) locales.`;
  }

  return {
    situationType: input.situationType,
    tacticSummary: input.tacticSummary,
    sampleSize: filtered.length,
    matchedEpisodes: matched.length,
    medianDelta,
    metric,
    unit,
    confidence,
    narrative,
  };
}
