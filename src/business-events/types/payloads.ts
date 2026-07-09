import { BentooBusinessEventType } from './event-type.enum';

export interface OrderCreatedPayload {
  orderId: string;
  orderNumber: string;
  type: string;
  total: number;
  customerName: string;
  itemCount: number;
}

export interface ReservationConfirmedPayload {
  reservationId: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
}

export interface ReservationNoShowPayload {
  reservationId: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
}

export interface RestaurantOpenedPayload {
  date: string;
  openedAt: string;
}

export interface RestaurantClosedPayload {
  date: string;
  closedAt: string;
}

export interface OrderReadyStalePayload {
  orderId: string;
  orderNumber: string;
  readyAt: string;
  minutesReady: number;
  tableLabel?: string;
}

export interface OrderDelayedPayload {
  orderId: string;
  orderNumber: string;
  delayMinutes: number;
  status: string;
}

export interface MenuUpdatedPayload {
  changeType: 'category' | 'dish' | 'modifier';
  entityId: string;
  entityName: string;
}

export interface PriceChangedPayload {
  dishId: string;
  dishName: string;
  previousPrice: number;
  newPrice: number;
}

export interface ProductOutOfStockPayload {
  dishId: string;
  dishName: string;
}

export interface PaymentFailedPayload {
  orderId?: string;
  checkoutSessionId?: string;
  amount: number;
  reason?: string;
}

export interface PaymentRecoveredPayload {
  orderId: string;
  orderNumber: string;
  amount: number;
}

export interface CustomerReturnedPayload {
  customerProfileId: string;
  customerName: string;
  daysSinceLastOrder: number;
}

export interface CustomerInactivePayload {
  customerProfileId: string;
  customerName: string;
  daysInactive: number;
}

export interface DailyClosingCompletedPayload {
  date: string;
  cashRegisterSessionId?: string;
  totalSales: number;
}

export interface DailyClosingMissingPayload {
  date: string;
  hoursOverdue: number;
}

export interface MarketingPublishedPayload {
  campaignId?: string;
  channel: string;
  title: string;
}

export interface MarketingSkippedPayload {
  campaignId?: string;
  reason: string;
}

export interface DeliveryAssignedPayload {
  orderId: string;
  orderNumber: string;
  driverId: string;
  driverName: string;
}

export interface DeliveryCompletedPayload {
  orderId: string;
  orderNumber: string;
  driverId?: string;
  driverName?: string;
}

export interface ReservationCreatedPayload {
  reservationId: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
  channel: 'public' | 'admin';
}

export interface ReservationCancelledPayload {
  reservationId: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
}

export interface ReservationPendingConfirmationPayload {
  reservationId: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
  hoursUntilService: number;
}

export interface ReservationNoShowRiskPayload {
  reservationId: string;
  customerName: string;
  date: string;
  time: string;
  partySize: number;
  minutesOverdue: number;
}

export interface InventoryLowStockPayload {
  inventoryItemId: string;
  itemName: string;
  currentStock: number;
  minStock: number;
  unit: string;
  affectedDishIds: string[];
  affectedDishNames: string[];
}

export interface SiteStalePublishedPayload {
  daysSincePublish: number;
  daysSinceUpdate: number;
}

export interface PaymentsVerifiedPayload {
  provider: string;
  verifiedAt: string;
}

export interface LoyaltyPointsEarnedPayload {
  accountId: string;
  customerEmail: string;
  customerName?: string;
  points: number;
  orderId?: string;
  newBalance: number;
}

export interface LoyaltyPointsRedeemedPayload {
  accountId: string;
  customerEmail: string;
  customerName?: string;
  points: number;
  orderId?: string;
  newBalance: number;
}

export interface LoyaltyTierUpgradedPayload {
  accountId: string;
  customerEmail: string;
  customerName?: string;
  previousTier: string;
  newTier: string;
  totalEarned: number;
}

export interface ShiftOpenedPayload {
  shiftId: string;
  segment: string;
  shiftLeadUserId: string;
  rosterCount: number;
  businessDate: string;
}

export interface ShiftClosingStartedPayload {
  shiftId: string;
  businessDate: string;
}

export interface ShiftClosedPayload {
  shiftId: string;
  durationMinutes: number;
  coordinationStats: {
    total: number;
    resolved: number;
    expired: number;
    escalated: number;
    transferred: number;
  };
}

export interface ShiftLeadAssignedPayload {
  shiftId: string;
  userId: string;
  previousLeadUserId?: string;
}

export interface ShiftRosterChangedPayload {
  shiftId: string;
  added: string[];
  removed: string[];
}

export interface CoordinationOpenedPayload {
  coordinationId: string;
  type: string;
  priority: string;
  shiftId: string;
  contextRef: { type: string; id: string; label?: string };
  title: string;
}

export interface CoordinationAcknowledgedPayload {
  coordinationId: string;
  userId: string;
}

export interface CoordinationCompletedPayload {
  coordinationId: string;
  outcome: string;
  resultSummary?: string;
}

export interface CoordinationDeclinedPayload {
  coordinationId: string;
  reason?: string;
}

export interface CoordinationEscalatedPayload {
  coordinationId: string;
  escalatedToUserId?: string;
}

export interface CoordinationExpiredPayload {
  coordinationId: string;
}

export interface HelpRequestedPayload {
  coordinationId: string;
  requesterUserId: string;
  stationId?: string;
}

export interface ApprovalRequestedPayload {
  coordinationId: string;
  requesterUserId: string;
  amount?: number;
  contextRef: { type: string; id: string; label?: string };
}

export interface ApprovalResolvedPayload {
  coordinationId: string;
  approved: boolean;
  resolverUserId: string;
}

export interface HandoffPublishedPayload {
  handoffId: string;
  fromShiftId: string;
  sectionCount: number;
  openCoordinationCount: number;
}

export interface HandoffAcceptedPayload {
  handoffId: string;
  toShiftId: string;
  acceptedByUserId: string;
}

export interface IntelligenceMovePreparedPayload {
  preparationId: string;
  situationType?: string;
  situationId?: string;
  type: string;
  priority?: string;
  title: string;
  description?: string;
  target: { targetType: string; targetId: string };
  contextRef?: {
    type: string;
    id: string;
    label?: string;
    deepLink?: string;
  };
  suggestedActions?: Array<{ id: string; label: string; actionType?: string }>;
  expectedImpact?: {
    metric: string;
    deltaMinutes?: number;
    unit?: string;
  };
  ackDeadlineMinutes?: number;
}

/** Maps event types to their payload shapes for type-safe publishing. */
export interface BentooBusinessEventPayloadMap {
  [BentooBusinessEventType.RestaurantOpened]: RestaurantOpenedPayload;
  [BentooBusinessEventType.RestaurantClosed]: RestaurantClosedPayload;
  [BentooBusinessEventType.OrderCreated]: OrderCreatedPayload;
  [BentooBusinessEventType.OrderDelayed]: OrderDelayedPayload;
  [BentooBusinessEventType.OrderReadyStale]: OrderReadyStalePayload;
  [BentooBusinessEventType.ReservationNoShow]: ReservationNoShowPayload;
  [BentooBusinessEventType.ReservationConfirmed]: ReservationConfirmedPayload;
  [BentooBusinessEventType.MenuUpdated]: MenuUpdatedPayload;
  [BentooBusinessEventType.PriceChanged]: PriceChangedPayload;
  [BentooBusinessEventType.ProductOutOfStock]: ProductOutOfStockPayload;
  [BentooBusinessEventType.PaymentFailed]: PaymentFailedPayload;
  [BentooBusinessEventType.PaymentRecovered]: PaymentRecoveredPayload;
  [BentooBusinessEventType.CustomerReturned]: CustomerReturnedPayload;
  [BentooBusinessEventType.CustomerInactive]: CustomerInactivePayload;
  [BentooBusinessEventType.DailyClosingCompleted]: DailyClosingCompletedPayload;
  [BentooBusinessEventType.DailyClosingMissing]: DailyClosingMissingPayload;
  [BentooBusinessEventType.MarketingPublished]: MarketingPublishedPayload;
  [BentooBusinessEventType.MarketingSkipped]: MarketingSkippedPayload;
  [BentooBusinessEventType.DeliveryAssigned]: DeliveryAssignedPayload;
  [BentooBusinessEventType.DeliveryCompleted]: DeliveryCompletedPayload;
  [BentooBusinessEventType.ReservationCreated]: ReservationCreatedPayload;
  [BentooBusinessEventType.ReservationCancelled]: ReservationCancelledPayload;
  [BentooBusinessEventType.ReservationPendingConfirmation]: ReservationPendingConfirmationPayload;
  [BentooBusinessEventType.ReservationNoShowRisk]: ReservationNoShowRiskPayload;
  [BentooBusinessEventType.InventoryLowStock]: InventoryLowStockPayload;
  [BentooBusinessEventType.SiteStalePublished]: SiteStalePublishedPayload;
  [BentooBusinessEventType.PaymentsVerified]: PaymentsVerifiedPayload;
  [BentooBusinessEventType.LoyaltyPointsEarned]: LoyaltyPointsEarnedPayload;
  [BentooBusinessEventType.LoyaltyPointsRedeemed]: LoyaltyPointsRedeemedPayload;
  [BentooBusinessEventType.LoyaltyTierUpgraded]: LoyaltyTierUpgradedPayload;
  [BentooBusinessEventType.ShiftOpened]: ShiftOpenedPayload;
  [BentooBusinessEventType.ShiftClosingStarted]: ShiftClosingStartedPayload;
  [BentooBusinessEventType.ShiftClosed]: ShiftClosedPayload;
  [BentooBusinessEventType.ShiftLeadAssigned]: ShiftLeadAssignedPayload;
  [BentooBusinessEventType.ShiftRosterChanged]: ShiftRosterChangedPayload;
  [BentooBusinessEventType.CoordinationOpened]: CoordinationOpenedPayload;
  [BentooBusinessEventType.CoordinationAcknowledged]: CoordinationAcknowledgedPayload;
  [BentooBusinessEventType.CoordinationCompleted]: CoordinationCompletedPayload;
  [BentooBusinessEventType.CoordinationDeclined]: CoordinationDeclinedPayload;
  [BentooBusinessEventType.CoordinationEscalated]: CoordinationEscalatedPayload;
  [BentooBusinessEventType.CoordinationExpired]: CoordinationExpiredPayload;
  [BentooBusinessEventType.HelpRequested]: HelpRequestedPayload;
  [BentooBusinessEventType.ApprovalRequested]: ApprovalRequestedPayload;
  [BentooBusinessEventType.ApprovalResolved]: ApprovalResolvedPayload;
  [BentooBusinessEventType.HandoffPublished]: HandoffPublishedPayload;
  [BentooBusinessEventType.HandoffAccepted]: HandoffAcceptedPayload;
  [BentooBusinessEventType.IntelligenceMovePrepared]: IntelligenceMovePreparedPayload;
}

export type BentooBusinessEventPayload<T extends BentooBusinessEventType> =
  BentooBusinessEventPayloadMap[T];
