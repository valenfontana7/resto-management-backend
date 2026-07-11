/** Eventos operativos del dominio tenant (orders, floor, caja, fiscal). */
export const OPERATIONAL_EVENT_TYPES = {
  ORDER_CREATED: 'operational.order.created',
  ORDER_STATUS_CHANGED: 'operational.order.status_changed',
  TABLE_SESSION_OPENED: 'operational.table_session.opened',
  TABLE_SESSION_CLOSED: 'operational.table_session.closed',
  TABLE_SESSION_VOIDED: 'operational.table_session.voided',
  TABLE_SESSION_ITEM_SENT: 'operational.table_session.item_sent',
  CASH_REGISTER_OPENED: 'operational.cash_register.opened',
  CASH_REGISTER_CLOSED: 'operational.cash_register.closed',
  FISCAL_DOCUMENT_ISSUED: 'operational.fiscal.document_issued',
} as const;

export type OperationalEventType =
  (typeof OPERATIONAL_EVENT_TYPES)[keyof typeof OPERATIONAL_EVENT_TYPES];

export interface OperationalEventPayload {
  restaurantId: string;
  eventType: OperationalEventType;
  aggregateType: string;
  aggregateId: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface OperationalEventHandler {
  readonly handlerKey: string;
  supports(eventType: OperationalEventType): boolean;
  handle(payload: OperationalEventPayload, outboxId: string): Promise<void>;
}
