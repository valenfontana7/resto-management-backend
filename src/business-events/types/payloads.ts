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

/** Maps event types to their payload shapes for type-safe publishing. */
export interface BentooBusinessEventPayloadMap {
  [BentooBusinessEventType.RestaurantOpened]: RestaurantOpenedPayload;
  [BentooBusinessEventType.RestaurantClosed]: RestaurantClosedPayload;
  [BentooBusinessEventType.OrderCreated]: OrderCreatedPayload;
  [BentooBusinessEventType.OrderDelayed]: OrderDelayedPayload;
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
}

export type BentooBusinessEventPayload<T extends BentooBusinessEventType> =
  BentooBusinessEventPayloadMap[T];
