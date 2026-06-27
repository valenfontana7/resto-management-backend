import { SubscriptionStatus } from '@prisma/client';
import {
  isInPostTrialGracePeriod,
  isSubscriptionBillingActive,
} from './subscription-billing-access';

describe('subscription-billing-access', () => {
  const now = new Date('2026-06-26T12:00:00.000Z');

  it('permite acceso en ACTIVE y TRIALING', () => {
    expect(
      isSubscriptionBillingActive(
        {
          status: SubscriptionStatus.ACTIVE,
          trialEnd: null,
          currentPeriodEnd: now,
        },
        now,
      ),
    ).toBe(true);
    expect(
      isSubscriptionBillingActive(
        {
          status: SubscriptionStatus.TRIALING,
          trialEnd: new Date('2026-07-01'),
          currentPeriodEnd: new Date('2026-07-01'),
        },
        now,
      ),
    ).toBe(true);
  });

  it('permite acceso en PAST_DUE durante gracia post-trial', () => {
    const sub = {
      status: SubscriptionStatus.PAST_DUE,
      trialEnd: new Date('2026-06-25T12:00:00.000Z'),
      currentPeriodEnd: new Date('2026-06-29T12:00:00.000Z'),
    };
    expect(isInPostTrialGracePeriod(sub, now)).toBe(true);
    expect(isSubscriptionBillingActive(sub, now)).toBe(true);
  });

  it('niega acceso cuando la gracia post-trial venció', () => {
    const sub = {
      status: SubscriptionStatus.PAST_DUE,
      trialEnd: new Date('2026-06-20T12:00:00.000Z'),
      currentPeriodEnd: new Date('2026-06-23T12:00:00.000Z'),
    };
    expect(isInPostTrialGracePeriod(sub, now)).toBe(false);
    expect(isSubscriptionBillingActive(sub, now)).toBe(false);
  });
});
