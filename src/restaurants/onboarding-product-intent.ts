export type OnboardingProductIntent = 'digital' | 'operations' | 'both';

export function featuresForProductIntent(intent?: OnboardingProductIntent) {
  switch (intent) {
    case 'operations':
      return {
        menu: true,
        orders: true,
        salon: true,
        tables: false,
        onlineOrdering: false,
        takeaway: false,
        socialMedia: false,
        reservations: false,
        delivery: false,
      };
    case 'digital':
      return {
        menu: true,
        orders: true,
        salon: true,
        tables: true,
        onlineOrdering: true,
        takeaway: true,
        socialMedia: true,
        reservations: true,
        delivery: false,
      };
    case 'both':
    default:
      return {
        menu: true,
        orders: true,
        salon: true,
        tables: true,
        onlineOrdering: true,
        takeaway: true,
        socialMedia: true,
        reservations: true,
        delivery: false,
      };
  }
}

type OnboardingFeatureOptions = {
  deliveryZonesEnabled?: boolean;
  hasDeliveryZones?: boolean;
  isStarter?: boolean;
};

export function resolveOnboardingFeatures(
  intent?: OnboardingProductIntent,
  options: OnboardingFeatureOptions = {},
) {
  const base = featuresForProductIntent(intent);
  const wantsDelivery =
    intent !== 'operations' &&
    !options.isStarter &&
    Boolean(options.deliveryZonesEnabled) &&
    Boolean(options.hasDeliveryZones);

  if (!wantsDelivery) return base;

  return {
    ...base,
    delivery: true,
  };
}

export function businessRulesPatchForIntent(intent?: OnboardingProductIntent) {
  return {
    onboarding: {
      productIntent: intent ?? 'both',
    },
  };
}

type BusinessRulesWithIntent = {
  onboarding?: { productIntent?: OnboardingProductIntent };
};

export function getRestaurantProductIntent(
  businessRules: unknown,
): OnboardingProductIntent {
  const intent = (businessRules as BusinessRulesWithIntent | null | undefined)
    ?.onboarding?.productIntent;

  if (intent === 'digital' || intent === 'operations' || intent === 'both') {
    return intent;
  }

  return 'both';
}

/** Canal digital requiere proveedor online antes de cerrar el onboarding formal. */
export function requiresOnlinePaymentForOnboardingComplete(
  intent: OnboardingProductIntent,
): boolean {
  return intent === 'digital' || intent === 'both';
}
