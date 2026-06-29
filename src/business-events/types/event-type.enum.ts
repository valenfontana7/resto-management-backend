/**
 * Canonical business event types for Bentoo's reactive cognitive architecture.
 * Each type is registered in event-registry.ts with metadata.
 */
export enum BentooBusinessEventType {
  RestaurantOpened = 'RestaurantOpened',
  RestaurantClosed = 'RestaurantClosed',
  OrderCreated = 'OrderCreated',
  OrderDelayed = 'OrderDelayed',
  ReservationNoShow = 'ReservationNoShow',
  ReservationConfirmed = 'ReservationConfirmed',
  MenuUpdated = 'MenuUpdated',
  PriceChanged = 'PriceChanged',
  ProductOutOfStock = 'ProductOutOfStock',
  PaymentFailed = 'PaymentFailed',
  PaymentRecovered = 'PaymentRecovered',
  CustomerReturned = 'CustomerReturned',
  CustomerInactive = 'CustomerInactive',
  DailyClosingCompleted = 'DailyClosingCompleted',
  DailyClosingMissing = 'DailyClosingMissing',
  MarketingPublished = 'MarketingPublished',
  MarketingSkipped = 'MarketingSkipped',
  DeliveryAssigned = 'DeliveryAssigned',
  DeliveryCompleted = 'DeliveryCompleted',
  ReservationCreated = 'ReservationCreated',
  ReservationCancelled = 'ReservationCancelled',
  ReservationPendingConfirmation = 'ReservationPendingConfirmation',
  ReservationNoShowRisk = 'ReservationNoShowRisk',
  InventoryLowStock = 'InventoryLowStock',
  SiteStalePublished = 'SiteStalePublished',
  PaymentsVerified = 'PaymentsVerified',
  LoyaltyPointsEarned = 'LoyaltyPointsEarned',
  LoyaltyPointsRedeemed = 'LoyaltyPointsRedeemed',
  LoyaltyTierUpgraded = 'LoyaltyTierUpgraded',
}

export type BentooBusinessEventTypeName = `${BentooBusinessEventType}`;
