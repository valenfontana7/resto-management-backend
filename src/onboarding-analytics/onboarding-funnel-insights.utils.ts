export interface FunnelStepInput {
  event: string;
  uniqueSessions: number;
  conversionFromPrev: number | null;
}

export interface FunnelHighlightsInput {
  landingToRegisterConversion?: number | null;
  trialBannerToPaymentIntentConversion?: number | null;
  trialBannerSessions?: number;
  customerWhatsappNotifiedSessions?: number;
}

export interface FunnelTopSourcesInput {
  landingCta?: Array<{ source: string; sessions: number }>;
}

export interface FunnelBiggestDrop {
  event: string;
  label: string;
  dropPercent: number;
  lostSessions: number;
}

export type FunnelRecommendationPriority = 'alta' | 'media' | 'baja';

export interface FunnelRecommendation {
  id: string;
  priority: FunnelRecommendationPriority;
  title: string;
  reason: string;
  action: string;
}

const STEP_LABELS: Record<string, string> = {
  register_started: 'Registro iniciado',
  register_completed: 'Registro completado',
  preview_published: 'Web publicada',
  first_dashboard_visit: 'Primer ingreso a Hoy',
  landing_viewed: 'Landing vista',
  trial_banner_viewed: 'Banner de trial visto',
  trial_banner_cta_clicked: 'CTA de pago en trial',
};

const SOURCE_LABELS: Record<string, string> = {
  hero_register: 'Hero -> registro',
  hero: 'Hero',
  pricing: 'Precios',
  cta_final: 'CTA final',
  unknown: 'Sin source',
};

function formatPercent(value: number | null): string {
  if (value == null) return '—';
  const fixed = value.toFixed(1);
  return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
}

function prettySource(source: string): string {
  return SOURCE_LABELS[source] ?? source.replace(/[_-]+/g, ' ');
}

export function buildFunnelBiggestDrop(
  steps: FunnelStepInput[],
): FunnelBiggestDrop | null {
  if (!steps.length) return null;

  let worst: FunnelBiggestDrop | null = null;

  steps.forEach((step, idx) => {
    if (idx === 0 || step.conversionFromPrev == null) return;
    const dropPercent = Math.max(0, 100 - step.conversionFromPrev);
    const previous = steps[idx - 1].uniqueSessions;
    const lostSessions = Math.max(0, previous - step.uniqueSessions);

    if (!worst || dropPercent > worst.dropPercent) {
      worst = {
        event: step.event,
        label: STEP_LABELS[step.event] ?? step.event,
        dropPercent,
        lostSessions,
      };
    }
  });

  return worst;
}

export function buildFunnelRecommendations(input: {
  steps: FunnelStepInput[];
  highlights?: FunnelHighlightsInput;
  topSources?: FunnelTopSourcesInput;
  biggestDrop?: FunnelBiggestDrop | null;
}): FunnelRecommendation[] {
  const items: FunnelRecommendation[] = [];
  const biggestDrop = input.biggestDrop ?? buildFunnelBiggestDrop(input.steps);

  const landingToRegister = input.highlights?.landingToRegisterConversion;
  if (landingToRegister != null && landingToRegister < 10) {
    items.push({
      id: 'landing-conversion-low',
      priority: 'alta',
      title: 'Subir conversión de landing a registro',
      reason: `La conversión actual es ${formatPercent(landingToRegister)}%, baja para tráfico con intención.`,
      action:
        'A/B testear hero y CTA principal: propuesta de valor más concreta + prueba de 1 minuto en demo + CTA visible por WhatsApp.',
    });
  }

  const trialToPay = input.highlights?.trialBannerToPaymentIntentConversion;
  const trialBannerSessions = input.highlights?.trialBannerSessions ?? 0;
  if (trialToPay != null && trialBannerSessions >= 8 && trialToPay < 20) {
    items.push({
      id: 'trial-payment-intent-low',
      priority: 'alta',
      title: 'Mejorar paso de trial a intención de pago',
      reason: `Solo ${formatPercent(trialToPay)}% de quienes ven el banner avanzan a suscripción.`,
      action:
        'Reforzar banner de trial con beneficio concreto (sin corte, sin fricción) + botón de ayuda humana más visible + recordatorios por estado.',
    });
  }

  if (biggestDrop && biggestDrop.dropPercent >= 30) {
    items.push({
      id: 'biggest-drop',
      priority: 'media',
      title: `Atacar la mayor caída: ${biggestDrop.label}`,
      reason: `Se pierde ${formatPercent(biggestDrop.dropPercent)}% en este paso (${biggestDrop.lostSessions} sesiones).`,
      action:
        'Revisar UX y microcopy de ese paso con session replay/eventos de error, y ejecutar un experimento puntual antes de tocar todo el funnel.',
    });
  }

  const notifiedSessions =
    input.highlights?.customerWhatsappNotifiedSessions ?? 0;
  const firstDashboardSessions =
    input.steps.find((s) => s.event === 'first_dashboard_visit')
      ?.uniqueSessions ?? 0;
  if (firstDashboardSessions >= 5) {
    const notifyRate =
      Math.round((notifiedSessions / firstDashboardSessions) * 1000) / 10;
    if (notifyRate < 35) {
      items.push({
        id: 'whatsapp-adoption-low',
        priority: 'media',
        title: 'Subir adopción del aviso por WhatsApp al comensal',
        reason: `Solo ${formatPercent(notifyRate)}% de sesiones de Hoy usan el aviso al cliente.`,
        action:
          'Destacar el botón en flujo operativo (pedido listo/en camino) con tooltip contextual y medir impacto por estado.',
      });
    }
  }

  const landingSources = input.topSources?.landingCta ?? [];
  if (landingSources.length > 1) {
    const total = landingSources.reduce((acc, row) => acc + row.sessions, 0);
    const first = landingSources[0];
    if (total > 0) {
      const share = (first.sessions / total) * 100;
      if (share > 75) {
        items.push({
          id: 'source-concentration',
          priority: 'baja',
          title: 'Diversificar fuentes de clic en landing',
          reason: `${prettySource(first.source)} concentra ${formatPercent(share)}% de los clics CTA.`,
          action:
            'Replicar el patrón ganador en 1-2 zonas adicionales (pricing/footer) para reducir dependencia de un solo bloque.',
        });
      }
    }
  }

  if (items.length === 0) {
    items.push({
      id: 'healthy-funnel',
      priority: 'baja',
      title: 'Funnel estable en el rango analizado',
      reason:
        'No se detectan alertas críticas automáticas con las reglas actuales.',
      action:
        'Mantener seguimiento semanal y abrir experimentos incrementales en adquisición o activación sin cambios disruptivos.',
    });
  }

  const order: Record<FunnelRecommendationPriority, number> = {
    alta: 0,
    media: 1,
    baja: 2,
  };

  return items.sort((a, b) => order[a.priority] - order[b.priority]);
}
