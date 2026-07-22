import { PaymentParticipant } from './payment.participant';

describe('PaymentParticipant', () => {
  it('aprueba un checkout sintético usando paymentId por defecto', async () => {
    const orders = {
      processCheckoutPaymentApproved: jest.fn().mockResolvedValue({
        id: 'checkout-1',
        status: 'PAID',
      }),
    };
    const participant = new PaymentParticipant(orders as never);

    const result = await participant.approveSynthetic(
      {
        runId: 'run-1',
        restaurantId: 'rest-1',
        simulatedNow: new Date('2026-07-21T20:00:00.000Z'),
        correlationId: 'corr-1',
      },
      {
        checkoutSessionId: 'checkout-1',
      },
    );

    expect(result).toEqual({
      id: 'checkout-1',
      status: 'PAID',
    });
    expect(orders.processCheckoutPaymentApproved).toHaveBeenCalledWith(
      'checkout-1',
      'lab-pay-checkout-1',
    );
  });

  it('respeta un paymentId explícito cuando está presente', async () => {
    const orders = {
      processCheckoutPaymentApproved: jest.fn().mockResolvedValue({
        id: 'checkout-2',
        status: 'PAID',
      }),
    };
    const participant = new PaymentParticipant(orders as never);

    await participant.approveSynthetic(
      {
        runId: 'run-2',
        restaurantId: 'rest-2',
        simulatedNow: new Date('2026-07-21T20:05:00.000Z'),
        correlationId: 'corr-2',
      },
      {
        checkoutSessionId: 'checkout-2',
        paymentId: 'lab-explicit-2',
      },
    );

    expect(orders.processCheckoutPaymentApproved).toHaveBeenCalledWith(
      'checkout-2',
      'lab-explicit-2',
    );
  });
});
