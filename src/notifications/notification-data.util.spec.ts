import { Prisma } from '@prisma/client';
import { sanitizeNotificationData } from './notification-data.util';

describe('sanitizeNotificationData', () => {
  it('converts Prisma Decimal-like values to numbers', () => {
    const decimalLike = {
      toNumber: () => 12500.5,
    };

    expect(sanitizeNotificationData(decimalLike)).toBe(12500.5);
  });

  it('includes order metadata as plain JSON', () => {
    const data = sanitizeNotificationData({
      orderId: 'ord_1',
      orderNumber: '42',
      total: { toNumber: () => 9900 },
      nested: { status: 'CONFIRMED' },
    }) as Record<string, unknown>;

    expect(data.orderId).toBe('ord_1');
    expect(data.orderNumber).toBe('42');
    expect(data.total).toBe(9900);
    expect(data.nested).toEqual({ status: 'CONFIRMED' });
  });

  it('serializes dates and omits unsupported values safely', () => {
    const date = new Date('2026-06-21T12:00:00.000Z');
    const data = sanitizeNotificationData({
      createdAt: date,
      note: undefined,
    }) as Record<string, unknown>;

    expect(data.createdAt).toBe('2026-06-21T12:00:00.000Z');
    expect(data.note).toBeUndefined();
  });
});

describe('notification data persistence shape', () => {
  it('matches Prisma InputJsonValue constraints', () => {
    const payload = sanitizeNotificationData({
      orderId: 'ord_1',
      total: { toNumber: () => 1000 },
    });

    const json = JSON.stringify(payload);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(payload).toEqual({
      orderId: 'ord_1',
      total: 1000,
    } satisfies Prisma.InputJsonValue as unknown as Record<string, unknown>);
  });
});
