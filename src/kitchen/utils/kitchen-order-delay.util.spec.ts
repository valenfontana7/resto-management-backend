import { computeKitchenDelay } from './kitchen-order-delay.util';

describe('computeKitchenDelay', () => {
  const now = new Date('2026-07-17T23:30:00.000Z');

  it('marca isDelayed cuando supera el SLA', () => {
    const result = computeKitchenDelay({
      status: 'CONFIRMED',
      confirmedAt: '2026-07-17T23:00:00.000Z',
      createdAt: '2026-07-17T23:00:00.000Z',
      now,
      slaMinutes: 20,
    });
    expect(result.minutesWaiting).toBe(30);
    expect(result.isDelayed).toBe(true);
    expect(result.kitchenSlaMinutes).toBe(20);
  });

  it('no marca demora si está dentro del SLA', () => {
    const result = computeKitchenDelay({
      status: 'PREPARING',
      confirmedAt: '2026-07-17T23:15:00.000Z',
      createdAt: '2026-07-17T23:15:00.000Z',
      now,
      slaMinutes: 20,
    });
    expect(result.minutesWaiting).toBe(15);
    expect(result.isDelayed).toBe(false);
  });

  it('no aplica a READY/DELIVERED', () => {
    const result = computeKitchenDelay({
      status: 'READY',
      confirmedAt: '2026-07-17T22:00:00.000Z',
      createdAt: '2026-07-17T22:00:00.000Z',
      now,
    });
    expect(result.isDelayed).toBe(false);
    expect(result.minutesWaiting).toBe(0);
  });
});
