/**
 * Canonical domain events for the Decision Engine signal pipeline (R1).
 * Distinct from BentooBusinessEventType — mapped in a future adapter.
 * @see docs/engineering/R1/001-signals.md
 */
export enum DecisionDomainEventType {
  RestaurantCreated = 'restaurant.created',
  SitePublished = 'site.published',
  SiteUnpublished = 'site.unpublished',
  MenuReady = 'menu.ready',
  MenuEmpty = 'menu.empty',
  PaymentsOnlineConnected = 'payments.online_connected',
  PaymentsConnectionFailed = 'payments.connection_failed',
  OrderPaid = 'order.paid',
  SubscriptionCancelRequested = 'subscription.cancel_requested',
  SubscriptionPaymentFailed = 'subscription.payment_failed',
  GoliveStepStalled = 'golive.step_stalled',
  GoliveCompleted = 'golive.completed',
  UserInvited = 'user.invited',
  UserLoggedIn = 'user.logged_in',
  SalonDesktopReady = 'salon.desktop_ready',
  CashSessionClosed = 'salon.session_closed',
  ReservationConfirmed = 'reservation.confirmed',
}

export interface DecisionDomainEvent {
  id: string;
  restaurantId: string;
  type: DecisionDomainEventType;
  payload: Record<string, unknown>;
  occurredAt: Date;
  source: string;
}

export type DecisionDomainEventInput = Omit<
  DecisionDomainEvent,
  'occurredAt'
> & {
  occurredAt?: Date | string;
};

export function normalizeDomainEvent(
  input: DecisionDomainEventInput,
): DecisionDomainEvent {
  return {
    ...input,
    occurredAt:
      input.occurredAt instanceof Date
        ? input.occurredAt
        : new Date(input.occurredAt ?? Date.now()),
  };
}

/** Value-bearing events for inactivity / frequency rules (INV-19: login alone excluded). */
export const VALUE_EVENT_TYPES: ReadonlySet<DecisionDomainEventType> = new Set([
  DecisionDomainEventType.OrderPaid,
  DecisionDomainEventType.CashSessionClosed,
  DecisionDomainEventType.ReservationConfirmed,
  DecisionDomainEventType.SitePublished,
]);
