import {
  getRestaurantProductIntent,
  requiresOnlinePaymentForOnboardingComplete,
} from './onboarding-product-intent';

describe('onboarding-product-intent', () => {
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
    it('skips online payment for operations-only', () => {
      expect(requiresOnlinePaymentForOnboardingComplete('operations')).toBe(
        false,
      );
    });

    it('requires online payment for digital and both', () => {
      expect(requiresOnlinePaymentForOnboardingComplete('digital')).toBe(true);
      expect(requiresOnlinePaymentForOnboardingComplete('both')).toBe(true);
    });
  });
});
