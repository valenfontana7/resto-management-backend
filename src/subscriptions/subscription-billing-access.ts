import { SubscriptionStatus } from '@prisma/client';

type SubscriptionBillingSnapshot = {
  status: SubscriptionStatus;
  trialEnd: Date | null;
  currentPeriodEnd: Date;
};

/** Acceso de producto mientras la suscripción está activa, en trial o en gracia post-trial. */
export function isSubscriptionBillingActive(
  subscription: SubscriptionBillingSnapshot,
  now: Date = new Date(),
): boolean {
  if (
    subscription.status === SubscriptionStatus.ACTIVE ||
    subscription.status === SubscriptionStatus.TRIALING
  ) {
    return true;
  }

  if (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.trialEnd &&
    subscription.trialEnd <= now &&
    subscription.currentPeriodEnd > now
  ) {
    return true;
  }

  return false;
}

export function isInPostTrialGracePeriod(
  subscription: SubscriptionBillingSnapshot,
  now: Date = new Date(),
): boolean {
  return (
    subscription.status === SubscriptionStatus.PAST_DUE &&
    subscription.trialEnd != null &&
    subscription.trialEnd <= now &&
    subscription.currentPeriodEnd > now
  );
}
