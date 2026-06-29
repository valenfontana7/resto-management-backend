import { Injectable } from '@nestjs/common';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

@Injectable()
export class DeliveryBusinessEventsService {
  constructor(private readonly publisher: BusinessEventPublisherService) {}

  publishDeliveryAssigned(input: {
    restaurantId: string;
    orderId: string;
    orderNumber: string;
    driverId: string;
    driverName: string;
    source?: string;
  }): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.DeliveryAssigned,
        restaurantId: input.restaurantId,
        source: input.source ?? 'delivery',
        correlationId: input.orderId,
        payload: {
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          driverId: input.driverId,
          driverName: input.driverName,
        },
      })
      .catch(() => undefined);
  }

  publishDeliveryCompleted(input: {
    restaurantId: string;
    orderId: string;
    orderNumber: string;
    driverId?: string;
    driverName?: string;
    source?: string;
  }): void {
    void this.publisher
      .publish({
        eventType: BentooBusinessEventType.DeliveryCompleted,
        restaurantId: input.restaurantId,
        source: input.source ?? 'delivery',
        correlationId: input.orderId,
        payload: {
          orderId: input.orderId,
          orderNumber: input.orderNumber,
          driverId: input.driverId,
          driverName: input.driverName,
        },
      })
      .catch(() => undefined);
  }
}
