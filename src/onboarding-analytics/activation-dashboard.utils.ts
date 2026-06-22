export interface ActivationFriction {
  id: string;
  label: string;
  detail: string;
  severity: 'high' | 'medium' | 'low';
  metric: number;
  unit: 'percent' | 'count' | 'restaurants';
}

export interface FunnelDropInput {
  event: string;
  label: string;
  dropPercent: number;
  lostSessions: number;
}

export function buildTopFrictions(input: {
  funnelDrops: FunnelDropInput[];
  unpublishedAfter3Days: number;
  noMenuAfter7Days: number;
  noFirstChargeAfter14Days: number;
  limit?: number;
}): ActivationFriction[] {
  const frictions: ActivationFriction[] = [];

  for (const drop of input.funnelDrops) {
    if (drop.dropPercent < 20 || drop.lostSessions <= 0) continue;
    frictions.push({
      id: `funnel-${drop.event}`,
      label: drop.label,
      detail: `Caída de ${drop.dropPercent}% (${drop.lostSessions} sesiones perdidas)`,
      severity: drop.dropPercent >= 40 ? 'high' : 'medium',
      metric: drop.dropPercent,
      unit: 'percent',
    });
  }

  if (input.unpublishedAfter3Days > 0) {
    frictions.push({
      id: 'stuck-unpublished',
      label: 'Sin publicar después de 3 días',
      detail: `${input.unpublishedAfter3Days} restaurante(s) registrados sin sitio publicado`,
      severity: input.unpublishedAfter3Days >= 5 ? 'high' : 'medium',
      metric: input.unpublishedAfter3Days,
      unit: 'restaurants',
    });
  }

  if (input.noMenuAfter7Days > 0) {
    frictions.push({
      id: 'stuck-no-menu',
      label: 'Sin platos cargados',
      detail: `${input.noMenuAfter7Days} local(es) con más de 7 días y menú vacío`,
      severity: input.noMenuAfter7Days >= 5 ? 'high' : 'medium',
      metric: input.noMenuAfter7Days,
      unit: 'restaurants',
    });
  }

  if (input.noFirstChargeAfter14Days > 0) {
    frictions.push({
      id: 'stuck-no-charge',
      label: 'Sin primer cobro',
      detail: `${input.noFirstChargeAfter14Days} publicado(s) sin pedido cobrado a los 14 días`,
      severity: input.noFirstChargeAfter14Days >= 3 ? 'high' : 'medium',
      metric: input.noFirstChargeAfter14Days,
      unit: 'restaurants',
    });
  }

  const severityWeight = { high: 3, medium: 2, low: 1 };
  return frictions
    .sort(
      (a, b) =>
        severityWeight[b.severity] - severityWeight[a.severity] ||
        b.metric - a.metric,
    )
    .slice(0, input.limit ?? 3);
}

export function computePeriodDelta(
  current: number,
  previous: number,
): number | null {
  if (previous <= 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}
