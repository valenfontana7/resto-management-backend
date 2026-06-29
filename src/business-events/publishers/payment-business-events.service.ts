import { Injectable } from '@nestjs/common';
import { BusinessEventPublisherService } from '../business-event-publisher.service';
import { BentooBusinessEventType } from '../types/event-type.enum';

@Injectable()
export class PaymentBusinessEventsService {
  constructor(private readonly publisher: BusinessEventPublisherService) {}

  publishPaymentFailed(input: {
    restaurantId: string;
    checkoutSessionId: string;
    amount: number;
    reason?: string;
    source?: string;
  }): void {
    void this.publisher
      .publishDeduped(
        {
          eventType: BentooBusinessEventType.PaymentFailed,
          restaurantId: input.restaurantId,
          source: input.source ?? 'payments',
          correlationId: input.checkoutSessionId,
          payload: {
            checkoutSessionId: input.checkoutSessionId,
            amount: input.amount,
            reason: input.reason,
          },
        },
        60,
      )
      .catch(() => undefined);
  }

  async publishPaymentRecovered(input: {
    restaurantId: string;
    orderId: string;
    orderNumber: string;
    amount: number;
    checkoutSessionId?: string;
    source?: string;
  }): Promise<void> {
    await this.publisher.publish({
      eventType: BentooBusinessEventType.PaymentRecovered,
      restaurantId: input.restaurantId,
      source: input.source ?? 'payments',
      correlationId: input.orderId,
      payload: {
        orderId: input.orderId,
        orderNumber: input.orderNumber,
        amount: input.amount,
      },
    });
  }
}
