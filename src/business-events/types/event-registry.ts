import {
  BusinessEventImportance,
  BusinessEventReplayPolicy,
} from '@prisma/client';
import { BentooBusinessEventType } from './event-type.enum';

export interface EventRegistryEntry {
  eventType: BentooBusinessEventType;
  /** Default source module when not overridden at publish time */
  defaultSource: string;
  importance: BusinessEventImportance;
  replayPolicy: BusinessEventReplayPolicy;
  description: string;
}

/**
 * Central registry — every publishable business event must be declared here.
 * Subscribers and replay logic consult this for importance and replay policy.
 */
export const BENTOO_EVENT_REGISTRY: Record<
  BentooBusinessEventType,
  EventRegistryEntry
> = {
  [BentooBusinessEventType.RestaurantOpened]: {
    eventType: BentooBusinessEventType.RestaurantOpened,
    defaultSource: 'daily-operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Restaurant opened for the day',
  },
  [BentooBusinessEventType.RestaurantClosed]: {
    eventType: BentooBusinessEventType.RestaurantClosed,
    defaultSource: 'daily-operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Restaurant closed for the day',
  },
  [BentooBusinessEventType.OrderCreated]: {
    eventType: BentooBusinessEventType.OrderCreated,
    defaultSource: 'orders',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'New order received',
  },
  [BentooBusinessEventType.OrderDelayed]: {
    eventType: BentooBusinessEventType.OrderDelayed,
    defaultSource: 'orders',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Order exceeded SLA threshold',
  },
  [BentooBusinessEventType.ReservationNoShow]: {
    eventType: BentooBusinessEventType.ReservationNoShow,
    defaultSource: 'reservations',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Guest did not arrive for reservation',
  },
  [BentooBusinessEventType.ReservationConfirmed]: {
    eventType: BentooBusinessEventType.ReservationConfirmed,
    defaultSource: 'reservations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Reservation confirmed by staff or guest',
  },
  [BentooBusinessEventType.MenuUpdated]: {
    eventType: BentooBusinessEventType.MenuUpdated,
    defaultSource: 'menu',
    importance: BusinessEventImportance.LOW,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Menu structure or item changed',
  },
  [BentooBusinessEventType.PriceChanged]: {
    eventType: BentooBusinessEventType.PriceChanged,
    defaultSource: 'menu',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Dish price updated',
  },
  [BentooBusinessEventType.ProductOutOfStock]: {
    eventType: BentooBusinessEventType.ProductOutOfStock,
    defaultSource: 'inventory',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Product became unavailable',
  },
  [BentooBusinessEventType.PaymentFailed]: {
    eventType: BentooBusinessEventType.PaymentFailed,
    defaultSource: 'payments',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Online payment attempt failed',
  },
  [BentooBusinessEventType.PaymentRecovered]: {
    eventType: BentooBusinessEventType.PaymentRecovered,
    defaultSource: 'payments',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Previously failed payment succeeded',
  },
  [BentooBusinessEventType.CustomerReturned]: {
    eventType: BentooBusinessEventType.CustomerReturned,
    defaultSource: 'customers',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Returning customer placed an order',
  },
  [BentooBusinessEventType.CustomerInactive]: {
    eventType: BentooBusinessEventType.CustomerInactive,
    defaultSource: 'customers',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Customer inactive beyond threshold',
  },
  [BentooBusinessEventType.DailyClosingCompleted]: {
    eventType: BentooBusinessEventType.DailyClosingCompleted,
    defaultSource: 'floor',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Daily cash closing completed',
  },
  [BentooBusinessEventType.DailyClosingMissing]: {
    eventType: BentooBusinessEventType.DailyClosingMissing,
    defaultSource: 'floor',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Expected daily closing not completed',
  },
  [BentooBusinessEventType.MarketingPublished]: {
    eventType: BentooBusinessEventType.MarketingPublished,
    defaultSource: 'builder',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Marketing content published',
  },
  [BentooBusinessEventType.MarketingSkipped]: {
    eventType: BentooBusinessEventType.MarketingSkipped,
    defaultSource: 'builder',
    importance: BusinessEventImportance.LOW,
    replayPolicy: BusinessEventReplayPolicy.SKIP,
    description: 'Scheduled marketing action skipped',
  },
};

export function getEventRegistryEntry(
  eventType: BentooBusinessEventType,
): EventRegistryEntry {
  const entry = BENTOO_EVENT_REGISTRY[eventType];
  if (!entry) {
    throw new Error(`Unregistered business event type: ${eventType}`);
  }
  return entry;
}

export function isRegisteredEventType(
  value: string,
): value is BentooBusinessEventType {
  return Object.values(BentooBusinessEventType).includes(
    value as BentooBusinessEventType,
  );
}
