export interface GrowthBusinessRules {
  autoWinBackEnabled?: boolean;
  autoWinBackMaxPerWeek?: number;
  autoWinBackIncludeCoupon?: boolean;
  winBackCouponPercent?: number;
}

const DEFAULT_MAX_PER_WEEK = 5;

export function getGrowthSettings(businessRules: unknown): {
  autoWinBackEnabled: boolean;
  autoWinBackMaxPerWeek: number;
  autoWinBackIncludeCoupon: boolean;
  winBackCouponPercent: number;
} {
  const rules = businessRules as { growth?: GrowthBusinessRules } | null;
  const max = rules?.growth?.autoWinBackMaxPerWeek ?? DEFAULT_MAX_PER_WEEK;
  const couponPercent = rules?.growth?.winBackCouponPercent ?? 10;
  return {
    autoWinBackEnabled: rules?.growth?.autoWinBackEnabled === true,
    autoWinBackMaxPerWeek: Math.min(20, Math.max(1, max)),
    autoWinBackIncludeCoupon: rules?.growth?.autoWinBackIncludeCoupon === true,
    winBackCouponPercent: Math.min(30, Math.max(5, couponPercent)),
  };
}

export function mergeGrowthSettings(
  businessRules: unknown,
  patch: Partial<GrowthBusinessRules>,
): Record<string, unknown> {
  const current =
    businessRules && typeof businessRules === 'object'
      ? (businessRules as Record<string, unknown>)
      : {};
  const growth =
    current.growth && typeof current.growth === 'object'
      ? (current.growth as Record<string, unknown>)
      : {};
  return {
    ...current,
    growth: { ...growth, ...patch },
  };
}

export function startOfUtcDay(date = new Date()): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}
