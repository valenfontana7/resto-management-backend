import { PlanType } from '../dto';

export type RestrictionSeed = {
  key: string;
  type: 'limit' | 'boolean' | 'text';
  value: string;
};

export type PlanEntitlementsSnapshot = {
  planId: string;
  features: Record<string, boolean>;
  limits: Record<string, number>;
};

/** Claves legacy usadas en guards/DTOs → clave canónica en PlanRestriction */
export const ENFORCEMENT_FEATURE_ALIASES: Record<string, string> = {
  menu_digital: 'qr_menus',
  qr_code: 'qr_menus',
  basic_orders: 'online_orders',
  branding: 'custom_branding',
  reservations: 'reservations',
  kitchen_display: 'kitchen_display',
  analytics: 'analytics',
  whatsapp_integration: 'whatsapp',
  reviews: 'reviews',
  loyalty: 'loyalty',
  promotions: 'loyalty',
  multi_branch: 'multi_location',
  delivery_integration: 'delivery',
  pedidosya_rappi: 'custom_integrations',
  custom_api: 'api_access',
};

const UNLIMITED_THRESHOLD = 9999;

export function resolveEnforcementFeatureKey(featureKey: string): string {
  return ENFORCEMENT_FEATURE_ALIASES[featureKey] ?? featureKey;
}

export function parseLimitValue(raw: string): number {
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return 0;
  if (parsed >= UNLIMITED_THRESHOLD) return -1;
  return parsed;
}

export function isUnlimitedLimit(limit: number): boolean {
  return limit < 0 || limit >= UNLIMITED_THRESHOLD;
}

function booleanRestrictions(
  entries: Array<[string, boolean]>,
): RestrictionSeed[] {
  return entries.map(([key, enabled]) => ({
    key,
    type: 'boolean' as const,
    value: enabled ? 'true' : 'false',
  }));
}

function limitRestrictions(
  entries: Array<[string, number | 'unlimited']>,
): RestrictionSeed[] {
  return entries.map(([key, limit]) => ({
    key,
    type: 'limit' as const,
    value:
      limit === 'unlimited' || (typeof limit === 'number' && limit < 0)
        ? String(UNLIMITED_THRESHOLD)
        : String(limit),
  }));
}

/**
 * Fallback alineado con prisma/seed.ts (fuente de verdad cuando la DB no tiene filas).
 */
export const FALLBACK_RESTRICTIONS_BY_PLAN: Record<
  PlanType,
  RestrictionSeed[]
> = {
  [PlanType.STARTER]: [
    ...limitRestrictions([
      ['products', 10],
      ['users', 1],
      ['tables', 3],
      ['categories', 3],
      ['orders_per_month', 0],
      ['restaurants', 1],
    ]),
    ...booleanRestrictions([
      ['qr_menus', true],
      ['online_orders', false],
      ['reservations', false],
      ['delivery', false],
      ['analytics', false],
      ['custom_branding', false],
      ['kitchen_display', false],
      ['loyalty', false],
      ['reviews', false],
      ['multi_location', false],
      ['api_access', false],
      ['custom_integrations', false],
      ['mercadopago', false],
      ['whatsapp', false],
    ]),
    { key: 'support_level', type: 'text', value: 'self_service' },
  ],
  [PlanType.PROFESSIONAL]: [
    ...limitRestrictions([
      ['products', 200],
      ['users', 10],
      ['tables', 50],
      ['categories', 'unlimited'],
      ['orders_per_month', 1000],
      ['restaurants', 3],
    ]),
    ...booleanRestrictions([
      ['qr_menus', true],
      ['online_orders', true],
      ['reservations', true],
      ['delivery', true],
      ['analytics', true],
      ['custom_branding', true],
      ['kitchen_display', true],
      ['loyalty', true],
      ['reviews', true],
      ['multi_location', false],
      ['api_access', false],
      ['custom_integrations', false],
      ['mercadopago', true],
      ['whatsapp', true],
    ]),
    { key: 'support_level', type: 'text', value: 'priority' },
  ],
  [PlanType.ENTERPRISE]: [
    ...limitRestrictions([
      ['products', 'unlimited'],
      ['users', 'unlimited'],
      ['tables', 'unlimited'],
      ['categories', 'unlimited'],
      ['orders_per_month', 'unlimited'],
      ['restaurants', 'unlimited'],
    ]),
    ...booleanRestrictions([
      ['qr_menus', true],
      ['online_orders', true],
      ['reservations', true],
      ['delivery', true],
      ['analytics', true],
      ['custom_branding', true],
      ['kitchen_display', true],
      ['loyalty', true],
      ['reviews', true],
      ['multi_location', true],
      ['api_access', true],
      ['custom_integrations', true],
      ['mercadopago', true],
      ['whatsapp', true],
    ]),
    { key: 'support_level', type: 'text', value: 'dedicated' },
  ],
};

export function getFallbackRestrictions(planId: string): RestrictionSeed[] {
  const planType = planId as PlanType;
  return (
    FALLBACK_RESTRICTIONS_BY_PLAN[planType] ??
    FALLBACK_RESTRICTIONS_BY_PLAN[PlanType.STARTER]
  );
}

export function buildSnapshotFromRestrictions(
  planId: string,
  restrictions: RestrictionSeed[],
): PlanEntitlementsSnapshot {
  const features: Record<string, boolean> = {};
  const limits: Record<string, number> = {};

  for (const restriction of restrictions) {
    if (restriction.type === 'boolean') {
      features[restriction.key] = restriction.value === 'true';
    } else if (restriction.type === 'limit') {
      limits[restriction.key] = parseLimitValue(restriction.value);
    }
  }

  return { planId, features, limits };
}

export function buildFallbackSnapshot(
  planId: string,
): PlanEntitlementsSnapshot {
  return buildSnapshotFromRestrictions(planId, getFallbackRestrictions(planId));
}

export function fallbackHasFeature(
  planId: string,
  featureKey: string,
): boolean {
  const resolved = resolveEnforcementFeatureKey(featureKey);

  if (featureKey === 'unlimited_products') {
    const snapshot = buildFallbackSnapshot(planId);
    return isUnlimitedLimit(snapshot.limits.products ?? 0);
  }

  const snapshot = buildFallbackSnapshot(planId);
  return snapshot.features[resolved] ?? false;
}

export function fallbackGetMinimumPlanForFeature(
  featureKey: string,
): PlanType | null {
  const planOrder: PlanType[] = [
    PlanType.STARTER,
    PlanType.PROFESSIONAL,
    PlanType.ENTERPRISE,
  ];

  for (const plan of planOrder) {
    if (fallbackHasFeature(plan, featureKey)) {
      return plan;
    }
  }

  return null;
}
