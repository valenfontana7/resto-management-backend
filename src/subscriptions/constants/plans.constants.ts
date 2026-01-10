import { PlanType } from '../dto';

/**
 * Precios de los planes en centavos (ARS)
 */
export const PLAN_PRICES: Record<PlanType, number> = {
  [PlanType.STARTER]: 0,
  [PlanType.PROFESSIONAL]: 1500000, // $15.000 ARS
  [PlanType.ENTERPRISE]: 3500000, // $35.000 ARS
};

/**
 * Días de trial para planes de pago
 */
export const TRIAL_DAYS = 14;

/**
 * Días de gracia para pagos vencidos
 */
export const GRACE_PERIOD_DAYS = 3;

/**
 * Features disponibles por plan
 */
export const PLAN_FEATURES: Record<PlanType, string[]> = {
  [PlanType.STARTER]: ['menu_digital', 'qr_code', 'basic_orders', 'branding'],
  [PlanType.PROFESSIONAL]: [
    'menu_digital',
    'qr_code',
    'basic_orders',
    'branding',
    'unlimited_products',
    'reservations',
    'kitchen_display',
    'analytics',
    'whatsapp_integration',
  ],
  [PlanType.ENTERPRISE]: [
    'menu_digital',
    'qr_code',
    'basic_orders',
    'branding',
    'unlimited_products',
    'reservations',
    'kitchen_display',
    'analytics',
    'whatsapp_integration',
    'multi_branch',
    'delivery_integration',
    'pedidosya_rappi',
    'custom_api',
  ],
};

/**
 * Límites de productos por plan
 */
export const PLAN_LIMITS: Record<
  PlanType,
  { maxProducts: number; maxCategories: number }
> = {
  [PlanType.STARTER]: { maxProducts: 20, maxCategories: 5 },
  [PlanType.PROFESSIONAL]: { maxProducts: -1, maxCategories: -1 }, // Ilimitado
  [PlanType.ENTERPRISE]: { maxProducts: -1, maxCategories: -1 }, // Ilimitado
};

/**
 * Nombres de los planes para mostrar
 */
export const PLAN_NAMES: Record<PlanType, string> = {
  [PlanType.STARTER]: 'Starter',
  [PlanType.PROFESSIONAL]: 'Professional',
  [PlanType.ENTERPRISE]: 'Enterprise',
};

/**
 * Obtener el plan mínimo requerido para una feature
 */
export function getMinimumPlanForFeature(feature: string): PlanType | null {
  const planOrder: PlanType[] = [
    PlanType.STARTER,
    PlanType.PROFESSIONAL,
    PlanType.ENTERPRISE,
  ];

  for (const plan of planOrder) {
    if (PLAN_FEATURES[plan].includes(feature)) {
      return plan;
    }
  }

  return null;
}

/**
 * Verificar si un plan tiene acceso a una feature
 */
export function planHasFeature(planType: PlanType, feature: string): boolean {
  return PLAN_FEATURES[planType]?.includes(feature) ?? false;
}

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
