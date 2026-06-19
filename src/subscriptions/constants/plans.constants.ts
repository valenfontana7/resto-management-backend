import { PlanType } from '../dto';
import {
  FALLBACK_RESTRICTIONS_BY_PLAN,
  buildFallbackSnapshot,
  fallbackGetMinimumPlanForFeature,
  fallbackHasFeature,
  isUnlimitedLimit,
  resolveEnforcementFeatureKey,
} from './plan-restrictions.fallback';

/**
 * Precios de los planes en centavos (ARS)
 */
export const PLAN_PRICES: Record<PlanType, number> = {
  [PlanType.STARTER]: 2500000, // $25.000 ARS
  [PlanType.PROFESSIONAL]: 4500000, // $45.000 ARS
  [PlanType.ENTERPRISE]: 7000000, // $70.000 ARS
};

/**
 * Días de trial para planes de pago
 */
export const TRIAL_DAYS = 14;

/**
 * Días de gracia para pagos vencidos
 */
export const GRACE_PERIOD_DAYS = 3;

function buildPlanFeaturesFromFallback(planType: PlanType): string[] {
  const snapshot = buildFallbackSnapshot(planType);
  const legacyKeys = new Set<string>();

  for (const [key, enabled] of Object.entries(snapshot.features)) {
    if (enabled) {
      legacyKeys.add(key);
    }
  }

  if (isUnlimitedLimit(snapshot.limits.products ?? 0)) {
    legacyKeys.add('unlimited_products');
  }

  return Array.from(legacyKeys);
}

/**
 * Features disponibles por plan (derivadas del fallback alineado con seed)
 */
export const PLAN_FEATURES: Record<PlanType, string[]> = {
  [PlanType.STARTER]: buildPlanFeaturesFromFallback(PlanType.STARTER),
  [PlanType.PROFESSIONAL]: buildPlanFeaturesFromFallback(PlanType.PROFESSIONAL),
  [PlanType.ENTERPRISE]: buildPlanFeaturesFromFallback(PlanType.ENTERPRISE),
};

function readLimit(planType: PlanType, key: string): number {
  return buildFallbackSnapshot(planType).limits[key] ?? 0;
}

/**
 * Límites de menú por plan (derivados del fallback alineado con seed)
 */
export const PLAN_LIMITS: Record<
  PlanType,
  { maxProducts: number; maxCategories: number }
> = {
  [PlanType.STARTER]: {
    maxProducts: readLimit(PlanType.STARTER, 'products'),
    maxCategories: readLimit(PlanType.STARTER, 'categories'),
  },
  [PlanType.PROFESSIONAL]: {
    maxProducts: readLimit(PlanType.PROFESSIONAL, 'products'),
    maxCategories: readLimit(PlanType.PROFESSIONAL, 'categories'),
  },
  [PlanType.ENTERPRISE]: {
    maxProducts: readLimit(PlanType.ENTERPRISE, 'products'),
    maxCategories: readLimit(PlanType.ENTERPRISE, 'categories'),
  },
};

/**
 * Nombres de los planes para mostrar
 */
export const PLAN_NAMES: Record<PlanType, string> = {
  [PlanType.STARTER]: 'Directo',
  [PlanType.PROFESSIONAL]: 'Operación',
  [PlanType.ENTERPRISE]: 'Full',
};

/**
 * Obtener el plan mínimo requerido para una feature
 */
export function getMinimumPlanForFeature(feature: string): PlanType | null {
  return fallbackGetMinimumPlanForFeature(feature);
}

/**
 * Verificar si un plan tiene acceso a una feature (fallback sync)
 */
export function planHasFeature(planType: PlanType, feature: string): boolean {
  return fallbackHasFeature(planType, feature);
}

/**
 * Tipo de features del restaurante
 */
export interface RestaurantFeatures {
  menu: boolean;
  orders: boolean;
  reservations: boolean;
  delivery: boolean;
  loyalty: boolean;
  reviews: boolean;
  giftCards: boolean;
  catering: boolean;
  onlineOrdering: boolean;
  takeaway: boolean;
  socialMedia: boolean;
}

function buildRestaurantFeaturesFromPlan(plan: PlanType): RestaurantFeatures {
  const snapshot = buildFallbackSnapshot(plan);
  const feature = (key: string) => snapshot.features[key] ?? false;
  const onlineOrders = feature('online_orders');

  return {
    menu: feature('qr_menus'),
    orders: onlineOrders,
    reservations: feature('reservations'),
    delivery: feature('delivery'),
    loyalty: feature('loyalty'),
    reviews: feature('reviews'),
    giftCards: false,
    catering: false,
    onlineOrdering: onlineOrders,
    takeaway: onlineOrders,
    socialMedia: feature('custom_branding'),
  };
}

/**
 * Features habilitadas por defecto según el plan
 */
export const DEFAULT_FEATURES_BY_PLAN: Record<PlanType, RestaurantFeatures> = {
  [PlanType.STARTER]: buildRestaurantFeaturesFromPlan(PlanType.STARTER),
  [PlanType.PROFESSIONAL]: buildRestaurantFeaturesFromPlan(
    PlanType.PROFESSIONAL,
  ),
  [PlanType.ENTERPRISE]: buildRestaurantFeaturesFromPlan(PlanType.ENTERPRISE),
};

/**
 * Determinar si un cambio de plan es upgrade o downgrade
 */
export function isPlanUpgrade(
  currentPlan: PlanType,
  newPlan: PlanType,
): boolean {
  const planHierarchy: Record<PlanType, number> = {
    [PlanType.STARTER]: 0,
    [PlanType.PROFESSIONAL]: 1,
    [PlanType.ENTERPRISE]: 2,
  };

  return planHierarchy[newPlan] > planHierarchy[currentPlan];
}

/**
 * Ajustar features del restaurante según el plan de suscripción
 * Deshabilita features que no están permitidas en el nuevo plan
 */
export function adjustFeaturesForPlan(
  currentFeatures: Partial<RestaurantFeatures>,
  newPlan: PlanType,
): Partial<RestaurantFeatures> {
  const allowedFeatures = DEFAULT_FEATURES_BY_PLAN[newPlan];
  const adjustedFeatures: Partial<RestaurantFeatures> = { ...currentFeatures };

  (Object.keys(allowedFeatures) as Array<keyof RestaurantFeatures>).forEach(
    (featureKey) => {
      if (!allowedFeatures[featureKey]) {
        adjustedFeatures[featureKey] = false;
      }
    },
  );

  return adjustedFeatures;
}

export { FALLBACK_RESTRICTIONS_BY_PLAN, resolveEnforcementFeatureKey };
