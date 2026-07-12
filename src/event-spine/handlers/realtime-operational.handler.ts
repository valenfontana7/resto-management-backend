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
      eventType === OPERATIONAL_EVENT_TYPES.TABLE_SESSION_CLOSED ||
      eventType === OPERATIONAL_EVENT_TYPES.TABLE_SESSION_VOIDED ||
      eventType === OPERATIONAL_EVENT_TYPES.TABLE_SESSION_ITEM_SENT ||
      eventType === OPERATIONAL_EVENT_TYPES.CASH_REGISTER_OPENED ||
      eventType === OPERATIONAL_EVENT_TYPES.CASH_REGISTER_CLOSED ||
      eventType === OPERATIONAL_EVENT_TYPES.FISCAL_DOCUMENT_ISSUED
    );
  }

  async handle(
    payload: OperationalEventPayload,
    outboxId: string,
  ): Promise<void> {
    void outboxId;
    const eventName = this.resolveEventName(payload.eventType);

    this.ordersGateway.emitToRestaurant(payload.restaurantId, eventName, {
      ...payload.data,
      aggregateId: payload.aggregateId,
      eventType: payload.eventType,
    });

    this.logger.debug(`WS ${eventName} → restaurant ${payload.restaurantId}`);
  }

  private resolveEventName(eventType: OperationalEventType): string {
    switch (eventType) {
      case OPERATIONAL_EVENT_TYPES.ORDER_CREATED:
        return 'new-order';
      case OPERATIONAL_EVENT_TYPES.ORDER_STATUS_CHANGED:
      case OPERATIONAL_EVENT_TYPES.TABLE_SESSION_OPENED:
      case OPERATIONAL_EVENT_TYPES.TABLE_SESSION_CLOSED:
      case OPERATIONAL_EVENT_TYPES.TABLE_SESSION_VOIDED:
      case OPERATIONAL_EVENT_TYPES.TABLE_SESSION_ITEM_SENT:
      case OPERATIONAL_EVENT_TYPES.CASH_REGISTER_OPENED:
      case OPERATIONAL_EVENT_TYPES.CASH_REGISTER_CLOSED:
      case OPERATIONAL_EVENT_TYPES.FISCAL_DOCUMENT_ISSUED:
        return 'order-update';
      case OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_STARTED:
      case OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_STEP_COMPLETED:
      case OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_COMPLETED:
      case OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_UPDATED:
      case OPERATIONAL_EVENT_TYPES.OPERATIONAL_PROFILE_RESET:
        return 'operational-profile';
      default: {
        const _exhaustive: never = eventType;
        return _exhaustive;
      }
    }
  }
}
