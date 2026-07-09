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
  [BentooBusinessEventType.OrderReadyStale]: {
    eventType: BentooBusinessEventType.OrderReadyStale,
    defaultSource: 'operations',
    importance: BusinessEventImportance.LOW,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Order ready beyond pickup SLA — coordination task created',
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
  [BentooBusinessEventType.DeliveryAssigned]: {
    eventType: BentooBusinessEventType.DeliveryAssigned,
    defaultSource: 'delivery',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Delivery order assigned to driver',
  },
  [BentooBusinessEventType.DeliveryCompleted]: {
    eventType: BentooBusinessEventType.DeliveryCompleted,
    defaultSource: 'delivery',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Delivery order delivered to customer',
  },
  [BentooBusinessEventType.ReservationCreated]: {
    eventType: BentooBusinessEventType.ReservationCreated,
    defaultSource: 'reservations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'New reservation request received',
  },
  [BentooBusinessEventType.ReservationCancelled]: {
    eventType: BentooBusinessEventType.ReservationCancelled,
    defaultSource: 'reservations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Reservation cancelled',
  },
  [BentooBusinessEventType.ReservationPendingConfirmation]: {
    eventType: BentooBusinessEventType.ReservationPendingConfirmation,
    defaultSource: 'reservations',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Reservation awaiting confirmation near service time',
  },
  [BentooBusinessEventType.ReservationNoShowRisk]: {
    eventType: BentooBusinessEventType.ReservationNoShowRisk,
    defaultSource: 'reservations',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Confirmed reservation overdue — possible no-show',
  },
  [BentooBusinessEventType.InventoryLowStock]: {
    eventType: BentooBusinessEventType.InventoryLowStock,
    defaultSource: 'inventory',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Inventory item at or below minimum stock',
  },
  [BentooBusinessEventType.SiteStalePublished]: {
    eventType: BentooBusinessEventType.SiteStalePublished,
    defaultSource: 'builder',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.SKIP,
    description: 'Published site not updated recently',
  },
  [BentooBusinessEventType.PaymentsVerified]: {
    eventType: BentooBusinessEventType.PaymentsVerified,
    defaultSource: 'payments',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Online payment provider verified',
  },
  [BentooBusinessEventType.LoyaltyPointsEarned]: {
    eventType: BentooBusinessEventType.LoyaltyPointsEarned,
    defaultSource: 'loyalty',
    importance: BusinessEventImportance.LOW,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Customer earned loyalty points',
  },
  [BentooBusinessEventType.LoyaltyPointsRedeemed]: {
    eventType: BentooBusinessEventType.LoyaltyPointsRedeemed,
    defaultSource: 'loyalty',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Customer redeemed loyalty points',
  },
  [BentooBusinessEventType.LoyaltyTierUpgraded]: {
    eventType: BentooBusinessEventType.LoyaltyTierUpgraded,
    defaultSource: 'loyalty',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Customer loyalty tier upgraded',
  },
  [BentooBusinessEventType.ShiftOpened]: {
    eventType: BentooBusinessEventType.ShiftOpened,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Operation shift opened with shift lead',
  },
  [BentooBusinessEventType.ShiftClosingStarted]: {
    eventType: BentooBusinessEventType.ShiftClosingStarted,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Operation shift entered closing phase',
  },
  [BentooBusinessEventType.ShiftClosed]: {
    eventType: BentooBusinessEventType.ShiftClosed,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Operation shift closed with recap stats',
  },
  [BentooBusinessEventType.ShiftLeadAssigned]: {
    eventType: BentooBusinessEventType.ShiftLeadAssigned,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Shift lead responsibility assigned',
  },
  [BentooBusinessEventType.ShiftRosterChanged]: {
    eventType: BentooBusinessEventType.ShiftRosterChanged,
    defaultSource: 'operations',
    importance: BusinessEventImportance.LOW,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Shift roster membership changed',
  },
  [BentooBusinessEventType.CoordinationOpened]: {
    eventType: BentooBusinessEventType.CoordinationOpened,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Operational coordination opened',
  },
  [BentooBusinessEventType.CoordinationAcknowledged]: {
    eventType: BentooBusinessEventType.CoordinationAcknowledged,
    defaultSource: 'operations',
    importance: BusinessEventImportance.LOW,
    replayPolicy: BusinessEventReplayPolicy.SUMMARY,
    description: 'Coordination acknowledged by participant',
  },
  [BentooBusinessEventType.CoordinationCompleted]: {
    eventType: BentooBusinessEventType.CoordinationCompleted,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Coordination resolved with outcome',
  },
  [BentooBusinessEventType.CoordinationDeclined]: {
    eventType: BentooBusinessEventType.CoordinationDeclined,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Coordination declined or approval rejected',
  },
  [BentooBusinessEventType.CoordinationEscalated]: {
    eventType: BentooBusinessEventType.CoordinationEscalated,
    defaultSource: 'operations',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Coordination escalated to shift lead',
  },
  [BentooBusinessEventType.CoordinationExpired]: {
    eventType: BentooBusinessEventType.CoordinationExpired,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Coordination expired without resolution',
  },
  [BentooBusinessEventType.HelpRequested]: {
    eventType: BentooBusinessEventType.HelpRequested,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Staff requested operational help',
  },
  [BentooBusinessEventType.ApprovalRequested]: {
    eventType: BentooBusinessEventType.ApprovalRequested,
    defaultSource: 'operations',
    importance: BusinessEventImportance.HIGH,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Approval requested from shift lead',
  },
  [BentooBusinessEventType.ApprovalResolved]: {
    eventType: BentooBusinessEventType.ApprovalResolved,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Approval approved or rejected',
  },
  [BentooBusinessEventType.HandoffPublished]: {
    eventType: BentooBusinessEventType.HandoffPublished,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Shift handoff published for next shift',
  },
  [BentooBusinessEventType.HandoffAccepted]: {
    eventType: BentooBusinessEventType.HandoffAccepted,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Incoming shift accepted handoff',
  },
  [BentooBusinessEventType.IntelligenceMovePrepared]: {
    eventType: BentooBusinessEventType.IntelligenceMovePrepared,
    defaultSource: 'operations',
    importance: BusinessEventImportance.NORMAL,
    replayPolicy: BusinessEventReplayPolicy.FULL,
    description: 'Intelligence move routed to staff coordination',
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
