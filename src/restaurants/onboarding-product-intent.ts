export type OnboardingProductIntent = 'digital' | 'operations' | 'both';

export function featuresForProductIntent(intent?: OnboardingProductIntent) {
  switch (intent) {
    case 'operations':
      return {
        menu: true,
        orders: true,
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
        onlineOrdering: true,
        takeaway: true,
        socialMedia: true,
        reservations: true,
        delivery: false,
      };
  }
}

export function businessRulesPatchForIntent(intent?: OnboardingProductIntent) {
  return {
    onboarding: {
      productIntent: intent ?? 'both',
    },
  };
}
