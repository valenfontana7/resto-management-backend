import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { KitchenNotificationsService } from '../../kitchen/kitchen-notifications.service';
import {
  OPERATIONAL_EVENT_TYPES,
  type OperationalEventHandler,
  type OperationalEventPayload,
  type OperationalEventType,
} from '../operational-event.types';

@Injectable()
export class KitchenOperationalEventHandler implements OperationalEventHandler {
  readonly handlerKey = 'kitchen-notifications';
  private readonly logger = new Logger(KitchenOperationalEventHandler.name);

  constructor(
    @Inject(forwardRef(() => KitchenNotificationsService))
    private readonly kitchenNotifications: KitchenNotificationsService,
  ) {}

  supports(eventType: OperationalEventType): boolean {
    return (
      eventType === OPERATIONAL_EVENT_TYPES.ORDER_CREATED ||
      eventType === OPERATIONAL_EVENT_TYPES.ORDER_STATUS_CHANGED ||
      eventType === OPERATIONAL_EVENT_TYPES.TABLE_SESSION_ITEM_SENT
    );
  }

  async handle(
    payload: OperationalEventPayload,
    outboxId: string,
  ): Promise<void> {
    void outboxId;
    const orderId =
      typeof payload.data.orderId === 'string'
        ? payload.data.orderId
        : payload.aggregateId;

    this.kitchenNotifications.emitNotification(payload.restaurantId, {
      type:
        payload.eventType === OPERATIONAL_EVENT_TYPES.ORDER_CREATED
          ? 'order_created'
          : 'order_updated',
      orderId,
      data: payload.data,
    });

    this.logger.debug(`Kitchen notified for ${payload.eventType}`);
  }
}
