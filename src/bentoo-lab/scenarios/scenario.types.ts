export interface LabScenarioMenuItem {
  key: string;
  name: string;
  price: number;
  preparationMinutes: number;
}

interface LabScenarioEventBase {
  id: string;
  atMinute: number;
  priority: number;
}

export interface ClientCreateOrderScenarioEvent extends LabScenarioEventBase {
  type: 'CLIENT_CREATE_ONLINE_ORDER';
  participantKey: 'client';
  orderKey: string;
  /** Cupón opcional (growth Lab). */
  couponCode?: string;
  paymentMethod?: 'cash' | 'mercadopago';
}

export interface PaymentSyntheticApproveScenarioEvent
  extends LabScenarioEventBase {
  type: 'PAYMENT_SYNTHETIC_APPROVE';
  participantKey: 'system';
  orderKey: string;
}

export interface FiscalIssueOrderScenarioEvent extends LabScenarioEventBase {
  type: 'FISCAL_ISSUE_ORDER';
  participantKey: 'manager';
  orderKey: string;
  documentType?: 'FACTURA_B';
  customerName?: string;
  customerDocType?: string;
  customerDocNumber?: string;
}

export interface KitchenStartOrderScenarioEvent extends LabScenarioEventBase {
  type: 'KITCHEN_START_ORDER';
  participantKey: 'kitchen';
  orderKey: string;
}

export interface KitchenReadyOrderScenarioEvent extends LabScenarioEventBase {
  type: 'KITCHEN_READY_ORDER';
  participantKey: 'kitchen';
  orderKey: string;
}

export interface ManagerMarkOrderPaidScenarioEvent
  extends LabScenarioEventBase {
  type: 'MANAGER_MARK_ORDER_PAID';
  participantKey: 'manager';
  orderKey: string;
}

export interface ManagerMarkOrderDeliveredScenarioEvent
  extends LabScenarioEventBase {
  type: 'MANAGER_MARK_ORDER_DELIVERED';
  participantKey: 'manager';
  orderKey: string;
}

export interface IncidentKitchenDelayScenarioEvent
  extends LabScenarioEventBase {
  type: 'INCIDENT_KITCHEN_DELAY';
  participantKey: 'system';
  orderKey: string;
}

export interface IncidentStockoutScenarioEvent extends LabScenarioEventBase {
  type: 'INCIDENT_STOCKOUT';
  participantKey: 'manager';
  inventoryItemKey: string;
}

export interface FloorOpenTableScenarioEvent extends LabScenarioEventBase {
  type: 'FLOOR_OPEN_TABLE';
  participantKey: 'waiter';
  sessionKey: string;
  tableNumber: string;
  guestCount?: number;
}

export interface FloorAddItemsScenarioEvent extends LabScenarioEventBase {
  type: 'FLOOR_ADD_ITEMS';
  participantKey: 'waiter';
  sessionKey: string;
  dishName: string;
  quantity: number;
}

export interface FloorSendKitchenScenarioEvent extends LabScenarioEventBase {
  type: 'FLOOR_SEND_KITCHEN';
  participantKey: 'waiter';
  sessionKey: string;
}

export interface FloorCloseSessionScenarioEvent extends LabScenarioEventBase {
  type: 'FLOOR_CLOSE_SESSION';
  participantKey: 'manager' | 'waiter';
  sessionKey: string;
  paymentMethod?: 'cash';
  /** Cobro parcial por ítems: primer impago o todos. Default: todos. */
  itemSelector?: 'first-unpaid' | 'all-unpaid';
  fiscalDocumentType?: 'INTERNAL_TICKET' | 'FACTURA_B';
  customerName?: string;
  customerDocType?: string;
  customerDocNumber?: string;
}

export interface FloorMergeTablesScenarioEvent extends LabScenarioEventBase {
  type: 'FLOOR_MERGE_TABLES';
  participantKey: 'waiter';
  sessionKey: string;
  /** Números de mesas a unir (libres o con otra cuenta abierta). */
  tableNumbers: readonly string[];
}

export interface DeliveryCreateOrderScenarioEvent extends LabScenarioEventBase {
  type: 'DELIVERY_CREATE_ORDER';
  participantKey: 'waiter';
  orderKey: string;
  deliveryAddress: string;
  customerName?: string;
  customerPhone?: string;
}

export interface DeliveryAddItemsScenarioEvent extends LabScenarioEventBase {
  type: 'DELIVERY_ADD_ITEMS';
  participantKey: 'waiter';
  orderKey: string;
  dishName: string;
  quantity: number;
}

export interface ReservationCreateScenarioEvent extends LabScenarioEventBase {
  type: 'RESERVATION_CREATE';
  participantKey: 'system';
  reservationKey: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  partySize: number;
  /** HH:mm; la fecha efectiva la resuelve el participante (≥ mañana wall-clock). */
  time: string;
}

export interface CouponValidateScenarioEvent extends LabScenarioEventBase {
  type: 'COUPON_VALIDATE';
  participantKey: 'client';
  couponCode: string;
  orderAmount: number;
}

export interface LoyaltyEnrollScenarioEvent extends LabScenarioEventBase {
  type: 'LOYALTY_ENROLL';
  participantKey: 'client';
  customerEmail: string;
  customerName: string;
  customerPhone?: string;
}

export interface ReviewCreateScenarioEvent extends LabScenarioEventBase {
  type: 'REVIEW_CREATE';
  participantKey: 'client';
  customerName: string;
  rating: number;
  comment?: string;
  customerEmail?: string;
}

export interface BuilderPublicGetScenarioEvent extends LabScenarioEventBase {
  type: 'BUILDER_PUBLIC_GET';
  participantKey: 'client';
}

export interface CompleteSimulationScenarioEvent extends LabScenarioEventBase {
  type: 'SIMULATION_COMPLETE';
  participantKey: 'system';
}

export type LabScenarioEvent =
  | ClientCreateOrderScenarioEvent
  | KitchenStartOrderScenarioEvent
  | KitchenReadyOrderScenarioEvent
  | ManagerMarkOrderPaidScenarioEvent
  | ManagerMarkOrderDeliveredScenarioEvent
  | IncidentKitchenDelayScenarioEvent
  | IncidentStockoutScenarioEvent
  | FloorOpenTableScenarioEvent
  | FloorAddItemsScenarioEvent
  | FloorSendKitchenScenarioEvent
  | FloorCloseSessionScenarioEvent
  | FloorMergeTablesScenarioEvent
  | DeliveryCreateOrderScenarioEvent
  | DeliveryAddItemsScenarioEvent
  | ReservationCreateScenarioEvent
  | CouponValidateScenarioEvent
  | LoyaltyEnrollScenarioEvent
  | ReviewCreateScenarioEvent
  | PaymentSyntheticApproveScenarioEvent
  | FiscalIssueOrderScenarioEvent
  | BuilderPublicGetScenarioEvent
  | CompleteSimulationScenarioEvent;

export type LabScenarioInvariantKey =
  | 'TENANT_SCOPE'
  | 'ORDER_PREPARATION_CAUSALITY'
  | 'AUTHORIZED_ACTOR_ACTIONS'
  | 'EXTERNAL_EFFECTS_BLOCKED'
  | 'ORDER_STATE_VALIDITY'
  | 'EXPECTED_INCIDENTS_ONCE'
  | 'STOCK_NON_NEGATIVE'
  | 'TIMELINE_CONTIGUOUS'
  | 'INCIDENT_REPLAY_DETERMINISM'
  | 'NO_OPEN_ORDERS_AT_COMPLETE';

export type LabScenarioChannel = 'online' | 'salon';

export type LabScenarioParticipantKey =
  | 'client'
  | 'kitchen'
  | 'manager'
  | 'waiter';

export interface LabScenarioDefinition {
  id: string;
  version: string;
  label: string;
  durationMinutes: number;
  simulatedStartAt: string;
  defaultSpeed: 5 | 20 | 100;
  /** Preferido al crear el run (salón requiere ops-core). */
  preferredLabProfile?: 'minimal' | 'ops-core';
  restaurant: {
    type: 'pizzeria';
    channels: readonly LabScenarioChannel[];
  };
  menu: readonly LabScenarioMenuItem[];
  participants: readonly LabScenarioParticipantKey[];
  events: readonly LabScenarioEvent[];
  invariants: readonly LabScenarioInvariantKey[];
}
