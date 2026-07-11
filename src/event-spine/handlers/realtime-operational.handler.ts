import { Injectable, Logger } from '@nestjs/common';
import { OrdersGateway } from '../../websocket/orders.gateway';
import {
  OPERATIONAL_EVENT_TYPES,
  type OperationalEventHandler,
  type OperationalEventPayload,
  type OperationalEventType,
} from '../operational-event.types';

@Injectable()
export class RealtimeOperationalEventHandler
  implements OperationalEventHandler
{
  readonly handlerKey = 'websocket-realtime';
  private readonly logger = new Logger(RealtimeOperationalEventHandler.name);

  constructor(private readonly ordersGateway: OrdersGateway) {}

  supports(eventType: OperationalEventType): boolean {
    return (
      eventType === OPERATIONAL_EVENT_TYPES.ORDER_CREATED ||
      eventType === OPERATIONAL_EVENT_TYPES.ORDER_STATUS_CHANGED ||
      eventType === OPERATIONAL_EVENT_TYPES.TABLE_SESSION_OPENED ||
      eventType === OPERATIONAL_EVENT_TYPES.TABLE_SESSION_CLOSED
    );
  }

  async handle(
    payload: OperationalEventPayload,
    outboxId: string,
  ): Promise<void> {
    void outboxId;
    const eventName =
      payload.eventType === OPERATIONAL_EVENT_TYPES.ORDER_CREATED
        ? 'new-order'
        : 'order-update';

    this.ordersGateway.emitToRestaurant(payload.restaurantId, eventName, {
      ...payload.data,
      aggregateId: payload.aggregateId,
      eventType: payload.eventType,
    });

    this.logger.debug(`WS ${eventName} → restaurant ${payload.restaurantId}`);
  }
}
