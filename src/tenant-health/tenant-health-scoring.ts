import type {
  TenantHealthBand,
  TenantHealthMetricsInput,
  TenantHealthPlaybook,
} from './tenant-health.types';

export function computeTenantHealthScore(
  metrics: TenantHealthMetricsInput,
): number {
  let score = 0;
  if (metrics.isPublished) score += 20;
  if (metrics.hasOnlinePayments) score += 25;
  if (metrics.ordersLast30d > 0) score += 25;
  if (metrics.usersActiveLast7d >= 3) score += 20;
  if (metrics.subscriptionStatus === 'ACTIVE') score += 10;
  return score;
}

export function resolveHealthBand(score: number): TenantHealthBand {
  if (score >= 80) return 'healthy';
  if (score >= 60) return 'attention';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

export function resolveHealthPlaybook(
  band: TenantHealthBand,
  metrics: TenantHealthMetricsInput,
): TenantHealthPlaybook {
  switch (band) {
    case 'critical':
      return {
        id: 'cs-critical-go-live',
        title: 'Rescate go-live urgente',
        summary:
          'El tenant no completó activación mínima; priorizar contacto humano.',
        steps: [
          'Llamar al dueño en las próximas 24 h y confirmar bloqueo principal.',
          metrics.isPublished
            ? 'Sitio publicado — revisar primer pedido y cobro online.'
            : 'Publicar el sitio y validar menú visible.',
          metrics.hasOnlinePayments
            ? 'Cobro online activo — probar checkout de punta a punta.'
            : 'Conectar MercadoPago o Payway y hacer un cobro de prueba.',
          'Invitar al menos 2 personas del equipo con PIN de turno.',
        ],
        actions: [
          { key: 'impersonate', label: 'Entrar como dueño' },
          { key: 'restaurant_detail', label: 'Ver ficha' },
          { key: 'activation_dashboard', label: 'Tablero activación' },
        ],
      };
    case 'at_risk':
      return {
        id: 'cs-at-risk-winback',
        title: 'Win-back + checklist activación',
        summary: 'Hay señales de uso pero faltan hitos clave de retención.',
        steps: [
          'Enviar email win-back con checklist de 3 pasos (sitio, cobro, pedido).',
          metrics.ordersLast30d === 0
            ? 'Coordinar pedido de prueba en salón o delivery.'
            : 'Revisar último pedido y fricción en checkout.',
          metrics.usersActiveLast7d < 3
            ? 'Invitar mozo/cocina con PIN para el próximo turno.'
            : 'Confirmar que el equipo usa el workspace del turno.',
        ],
        actions: [
          { key: 'impersonate', label: 'Entrar como dueño' },
          { key: 'activation_dashboard', label: 'Tablero activación' },
        ],
      };
    case 'attention':
      return {
        id: 'cs-attention-nudge',
        title: 'Nudge de equipo y pedido prueba',
        summary: 'Activación avanzada; empujar hábito operativo del turno.',
        steps: [
          'Sugerir invitar 1 mozo y 1 cocinero si el equipo es chico.',
          'Proponer pedido de prueba en horario valle.',
          'Revisar si el sitio y cobro online están alineados con el menú real.',
        ],
        actions: [
          { key: 'restaurant_detail', label: 'Ver ficha' },
          { key: 'impersonate', label: 'Entrar como dueño' },
        ],
      };
    case 'healthy':
      return {
        id: 'cs-healthy-upsell',
        title: 'Upsell plan Inteligencia',
        summary: 'Tenant saludable; oportunidad de expansión y advocacy.',
        steps: [
          'Felicitación breve por hitos de activación cumplidos.',
          'Presentar valor de Inteligencia (briefing, decisiones, economía por canal).',
          'Pedir referido o caso de éxito si el NPS interno es alto.',
        ],
        actions: [{ key: 'restaurant_detail', label: 'Ver ficha' }],
      };
    default: {
      const _exhaustive: never = band;
      throw new Error(`Unknown health band: ${String(_exhaustive)}`);
    }
  }
}

export function emptyBandCounts(): Record<TenantHealthBand, number> {
  return {
    healthy: 0,
    attention: 0,
    at_risk: 0,
    critical: 0,
  };
}
