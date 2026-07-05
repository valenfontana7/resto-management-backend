import type { DecisionDomainEvent } from '../types/domain-event.types';
import {
  DecisionDomainEventType,
  VALUE_EVENT_TYPES,
} from '../types/domain-event.types';
import type { EvaluationContext } from '../types/evaluation-context.types';
import type { ProducedSignal } from '../types/signal.types';

export interface RestaurantSignalContext {
  restaurantId: string;
  evaluatedAt: Date;
  intent: EvaluationContext['intent'];
  tenureDays: number;
  trialDay: number | null;
  sitePublished: boolean;
  siteEverPublished: boolean;
  menuReady: boolean;
  paymentsOnlineConnected: boolean;
  paymentsConnectionFailed: boolean;
  goliveStepStalled: boolean;
  goliveCompleted: boolean;
  salonDesktopReady: boolean;
  cancelRequested: boolean;
  subscriptionPaymentFailed: boolean;
  hasPaidOrder: boolean;
  paidOrderCount: number;
  paidOrderEventIds: string[];
  valueEventTimestamps: Date[];
  lastValueEventAt: Date | null;
  ordersLast7Days: number;
  ordersBaselineWindow: number;
  configReverted: boolean;
  eventIdsByType: Partial<Record<DecisionDomainEventType, string[]>>;
}

export function buildRestaurantSignalContext(
  events: DecisionDomainEvent[],
  context: EvaluationContext,
): RestaurantSignalContext {
  const sorted = [...events].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  let sitePublished = false;
  let siteEverPublished = false;
  let menuReady = false;
  let paymentsOnlineConnected = false;
  let paymentsConnectionFailed = false;
  let goliveStepStalled = false;
  let goliveCompleted = false;
  let salonDesktopReady = false;
  let cancelRequested = false;
  let subscriptionPaymentFailed = false;
  let configReverted = false;

  const paidOrderEventIds: string[] = [];
  const valueEventTimestamps: Date[] = [];
  const eventIdsByType: Partial<Record<DecisionDomainEventType, string[]>> = {};

  for (const event of sorted) {
    if (!eventIdsByType[event.type]) {
      eventIdsByType[event.type] = [];
    }
    eventIdsByType[event.type]!.push(event.id);

    switch (event.type) {
      case DecisionDomainEventType.SitePublished:
        sitePublished = true;
        siteEverPublished = true;
        valueEventTimestamps.push(event.occurredAt);
        break;
      case DecisionDomainEventType.SiteUnpublished:
        sitePublished = false;
        if (siteEverPublished) {
          configReverted = true;
        }
        break;
      case DecisionDomainEventType.MenuReady:
        menuReady = true;
        break;
      case DecisionDomainEventType.MenuEmpty:
        menuReady = false;
        configReverted = true;
        break;
      case DecisionDomainEventType.PaymentsOnlineConnected:
        paymentsOnlineConnected = true;
        paymentsConnectionFailed = false;
        break;
      case DecisionDomainEventType.PaymentsConnectionFailed:
        paymentsConnectionFailed = true;
        paymentsOnlineConnected = false;
        configReverted = true;
        break;
      case DecisionDomainEventType.GoliveStepStalled:
        goliveStepStalled = true;
        break;
      case DecisionDomainEventType.GoliveCompleted:
        goliveCompleted = true;
        goliveStepStalled = false;
        break;
      case DecisionDomainEventType.SalonDesktopReady:
        salonDesktopReady = true;
        break;
      case DecisionDomainEventType.OrderPaid:
        paidOrderEventIds.push(event.id);
        valueEventTimestamps.push(event.occurredAt);
        break;
      case DecisionDomainEventType.CashSessionClosed:
      case DecisionDomainEventType.ReservationConfirmed:
        valueEventTimestamps.push(event.occurredAt);
        break;
      case DecisionDomainEventType.SubscriptionCancelRequested:
        cancelRequested = true;
        break;
      case DecisionDomainEventType.SubscriptionPaymentFailed:
        subscriptionPaymentFailed = true;
        break;
      default:
        break;
    }
  }

  const evaluatedAt = context.evaluatedAt;
  const ms7d = 7 * 24 * 60 * 60 * 1000;
  const ordersLast7Days = sorted.filter(
    (e) =>
      e.type === DecisionDomainEventType.OrderPaid &&
      evaluatedAt.getTime() - e.occurredAt.getTime() <= ms7d,
  ).length;

  const baselineWeeks = context.baseline?.windowWeeks ?? 8;
  const msBaseline = baselineWeeks * 7 * 24 * 60 * 60 * 1000;
  const ordersBaselineWindow = sorted.filter(
    (e) =>
      e.type === DecisionDomainEventType.OrderPaid &&
      evaluatedAt.getTime() - e.occurredAt.getTime() <= msBaseline,
  ).length;

  const valueEvents = sorted.filter((e) => VALUE_EVENT_TYPES.has(e.type));
  const lastValueEventAt =
    valueEvents.length > 0
      ? valueEvents[valueEvents.length - 1].occurredAt
      : null;

  return {
    restaurantId: context.restaurantId,
    evaluatedAt,
    intent: context.intent,
    tenureDays: context.tenureDays,
    trialDay: context.trialDay ?? null,
    sitePublished,
    siteEverPublished,
    menuReady,
    paymentsOnlineConnected,
    paymentsConnectionFailed,
    goliveStepStalled,
    goliveCompleted,
    salonDesktopReady,
    cancelRequested,
    subscriptionPaymentFailed,
    hasPaidOrder: paidOrderEventIds.length > 0,
    paidOrderCount: paidOrderEventIds.length,
    paidOrderEventIds,
    valueEventTimestamps,
    lastValueEventAt,
    ordersLast7Days,
    ordersBaselineWindow,
    configReverted,
    eventIdsByType,
  };
}

export function daysSince(from: Date | null, to: Date): number | null {
  if (!from) {
    return null;
  }
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export function getLatestEventIds(
  ctx: RestaurantSignalContext,
  type: DecisionDomainEventType,
): string[] {
  return ctx.eventIdsByType[type] ?? [];
}

export function findPriorSignal(
  priorState: ProducedSignal[],
  code: string,
): ProducedSignal | undefined {
  return priorState.find((s) => s.code === code && s.status === 'active');
}
