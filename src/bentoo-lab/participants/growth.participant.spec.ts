import { GrowthParticipant } from './growth.participant';

describe('GrowthParticipant', () => {
  it('valida cupón y enrolla loyalty', async () => {
    const http = {
      request: jest
        .fn()
        .mockResolvedValueOnce({
          valid: true,
          discountAmount: 800,
          message: 'Cupón válido',
        })
        .mockResolvedValueOnce({
          id: 'acc-1',
          customerEmail: 'growth@lab.bentoo.invalid',
          points: 0,
        }),
    };
    const participant = new GrowthParticipant(http as never);
    const ctx = {
      runId: 'run-1',
      restaurantId: 'rest-1',
      simulatedNow: new Date('2026-07-17T23:00:00.000Z'),
      correlationId: 'corr-1',
    };

    const coupon = await participant.validateCoupon(ctx, {
      couponCode: 'LAB10',
      orderAmount: 8000,
    });
    expect(coupon.valid).toBe(true);
    expect(http.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/public/restaurants/rest-1/coupons/validate',
        method: 'POST',
      }),
    );

    const account = await participant.enrollLoyalty(ctx, {
      email: 'growth@lab.bentoo.invalid',
      name: 'Cliente Growth',
    });
    expect(account.id).toBe('acc-1');
  });
});
