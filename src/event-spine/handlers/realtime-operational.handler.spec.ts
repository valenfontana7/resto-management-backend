import { RealtimeOperationalEventHandler } from './realtime-operational.handler';
import { OrdersGateway } from '../../websocket/orders.gateway';
import {
  OPERATIONAL_EVENT_TYPES,
  type OperationalEventPayload,
} from '../operational-event.types';

describe('RealtimeOperationalEventHandler', () => {
  const restaurantId = 'rest-1';
  const basePayload = (
    eventType: OperationalEventPayload['eventType'],
    data: Record<string, unknown> = {},
  ): OperationalEventPayload => ({
    restaurantId,
    eventType,
    aggregateType: 'table_session',
    aggregateId: 'session-1',
    occurredAt: new Date().toISOString(),
    data,
  });

  let gateway: { emitToRestaurant: jest.Mock };
  let handler: RealtimeOperationalEventHandler;

  beforeEach(() => {
    gateway = { emitToRestaurant: jest.fn() };
    handler = new RealtimeOperationalEventHandler(
      gateway as unknown as OrdersGateway,
    );
  });

  it('supports floor, cash register and fiscal operational events', () => {
    expect(handler.supports(OPERATIONAL_EVENT_TYPES.ORDER_CREATED)).toBe(true);
    expect(handler.supports(OPERATIONAL_EVENT_TYPES.TABLE_SESSION_VOIDED)).toBe(
      true,
    );
    expect(handler.supports(OPERATIONAL_EVENT_TYPES.CASH_REGISTER_OPENED)).toBe(
      true,
    );
    expect(
      handler.supports(OPERATIONAL_EVENT_TYPES.FISCAL_DOCUMENT_ISSUED),
    ).toBe(true);
  });

  it('emits new-order for ORDER_CREATED', async () => {
    await handler.handle(
      basePayload(OPERATIONAL_EVENT_TYPES.ORDER_CREATED, { orderId: 'o-1' }),
      'outbox-1',
    );

    expect(gateway.emitToRestaurant).toHaveBeenCalledWith(
      restaurantId,
      'new-order',
      expect.objectContaining({
        orderId: 'o-1',
        aggregateId: 'session-1',
        eventType: OPERATIONAL_EVENT_TYPES.ORDER_CREATED,
      }),
    );
  });

  it.each([
    OPERATIONAL_EVENT_TYPES.ORDER_STATUS_CHANGED,
    OPERATIONAL_EVENT_TYPES.TABLE_SESSION_OPENED,
    OPERATIONAL_EVENT_TYPES.TABLE_SESSION_CLOSED,
    OPERATIONAL_EVENT_TYPES.TABLE_SESSION_VOIDED,
    OPERATIONAL_EVENT_TYPES.TABLE_SESSION_ITEM_SENT,
    OPERATIONAL_EVENT_TYPES.CASH_REGISTER_OPENED,
    OPERATIONAL_EVENT_TYPES.CASH_REGISTER_CLOSED,
    OPERATIONAL_EVENT_TYPES.FISCAL_DOCUMENT_ISSUED,
  ])('emits order-update for %s', async (eventType) => {
    await handler.handle(
      basePayload(eventType, { tableId: 'table-3' }),
      'outbox-2',
    );

    expect(gateway.emitToRestaurant).toHaveBeenCalledWith(
      restaurantId,
      'order-update',
      expect.objectContaining({
        tableId: 'table-3',
        aggregateId: 'session-1',
        eventType,
      }),
    );
  });
});
