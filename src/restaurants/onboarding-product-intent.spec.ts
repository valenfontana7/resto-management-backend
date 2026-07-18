import {
  featuresForProductIntent,
  getRestaurantProductIntent,
  requiresOnlinePaymentForOnboardingComplete,
} from './onboarding-product-intent';

describe('onboarding-product-intent', () => {
  describe('featuresForProductIntent', () => {
    it('enables salon and tables for operations (mesa de prueba)', () => {
      expect(featuresForProductIntent('operations')).toMatchObject({
        salon: true,
        tables: true,
        onlineOrdering: false,
      });
    });
  });

  describe('getRestaurantProductIntent', () => {
    it('returns stored intent from businessRules', () => {
      expect(
        getRestaurantProductIntent({
          onboarding: { productIntent: 'operations' },
        }),
      ).toBe('operations');
    });

    it('defaults to both when missing', () => {
      expect(getRestaurantProductIntent(null)).toBe('both');
      expect(getRestaurantProductIntent({})).toBe('both');
    });
  });

  describe('requiresOnlinePaymentForOnboardingComplete', () => {
    it('never blocks activation on payment provider (post-WOW readiness)', () => {
      expect(requiresOnlinePaymentForOnboardingComplete('operations')).toBe(
        false,
      );
      expect(requiresOnlinePaymentForOnboardingComplete('digital')).toBe(false);
      expect(requiresOnlinePaymentForOnboardingComplete('both')).toBe(false);
    });
  });
});
