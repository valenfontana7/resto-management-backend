import { Injectable } from '@nestjs/common';
import { OrdersService } from '../../orders/orders.service';

export interface PaymentParticipantContext {
  runId: string;
  restaurantId: string;
  simulatedNow: Date;
  correlationId: string;
}

@Injectable()
export class PaymentParticipant {
  constructor(private readonly orders: OrdersService) {}

  async approveSynthetic(
    ctx: PaymentParticipantContext,
    input: { checkoutSessionId: string; paymentId?: string },
  ) {
    void ctx;
    return this.orders.processCheckoutPaymentApproved(
      input.checkoutSessionId,
      input.paymentId ?? `lab-pay-${input.checkoutSessionId}`,
    );
  }
}
