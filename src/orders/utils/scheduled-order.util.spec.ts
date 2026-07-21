import {
  extractOrderScheduleRules,
  isInstantWithinBusinessHours,
  isKitchenReleased,
  resolveScheduledOrder,
} from './scheduled-order.util';

describe('scheduled-order.util', () => {
  const hours = [
    {
      dayOfWeek: 1, // Monday
      isOpen: true,
      openTime: '10:00',
      closeTime: '22:00',
    },
  ];

  function localMondayAt(h: number, m: number): Date {
    // 2026-07-20 is a Monday
    return new Date(2026, 6, 20, h, m, 0, 0);
  }

  it('extracts order schedule rules', () => {
    expect(
      extractOrderScheduleRules({
        orders: { allowScheduledOrders: true, orderLeadTime: 45 },
      }),
    ).toEqual({ allowScheduledOrders: true, orderLeadTime: 45 });
  });

  it('rejects scheduled when flag is off', () => {
    expect(() =>
      resolveScheduledOrder({
        scheduledForRaw: localMondayAt(18, 0).toISOString(),
        rules: { allowScheduledOrders: false, orderLeadTime: 30 },
        hours,
        now: localMondayAt(12, 0),
      }),
    ).toThrow(/no acepta pedidos programados/i);
  });

  it('rejects slot outside business hours', () => {
    expect(() =>
      resolveScheduledOrder({
        scheduledForRaw: localMondayAt(23, 0).toISOString(),
        rules: { allowScheduledOrders: true, orderLeadTime: 30 },
        hours,
        now: localMondayAt(12, 0),
      }),
    ).toThrow(/fuera del horario/i);
  });

  it('rejects slot below lead time', () => {
    expect(() =>
      resolveScheduledOrder({
        scheduledForRaw: localMondayAt(12, 10).toISOString(),
        rules: { allowScheduledOrders: true, orderLeadTime: 30 },
        hours,
        now: localMondayAt(12, 0),
      }),
    ).toThrow(/al menos 30 minutos/i);
  });

  it('accepts valid slot and holds kitchen when far ahead', () => {
    const scheduled = localMondayAt(20, 0);
    const now = localMondayAt(12, 0);
    const resolved = resolveScheduledOrder({
      scheduledForRaw: scheduled.toISOString(),
      rules: { allowScheduledOrders: true, orderLeadTime: 45 },
      hours,
      now,
    });
    expect(resolved.scheduledFor?.getTime()).toBe(scheduled.getTime());
    expect(resolved.kitchenReleasedAt).toBeNull();
  });

  it('releases kitchen immediately when schedule is exactly at lead time', () => {
    const now = localMondayAt(19, 0);
    const scheduled = localMondayAt(19, 45); // exactly 45 min ahead
    const resolved = resolveScheduledOrder({
      scheduledForRaw: scheduled.toISOString(),
      rules: { allowScheduledOrders: true, orderLeadTime: 45 },
      hours,
      now,
    });
    expect(resolved.kitchenReleasedAt?.getTime()).toBe(now.getTime());
  });

  it('ASAP sets kitchenReleasedAt now', () => {
    const now = localMondayAt(12, 0);
    const resolved = resolveScheduledOrder({
      scheduledForRaw: '',
      rules: { allowScheduledOrders: true },
      hours,
      now,
    });
    expect(resolved.scheduledFor).toBeNull();
    expect(resolved.kitchenReleasedAt?.getTime()).toBe(now.getTime());
  });

  it('isInstantWithinBusinessHours respects open range', () => {
    expect(isInstantWithinBusinessHours(localMondayAt(15, 0), hours)).toBe(
      true,
    );
    expect(isInstantWithinBusinessHours(localMondayAt(9, 0), hours)).toBe(
      false,
    );
  });

  it('isKitchenReleased uses lead window', () => {
    const scheduled = localMondayAt(20, 0);
    // releaseAt = 19:15 with lead 45
    expect(
      isKitchenReleased({
        scheduledFor: scheduled,
        now: localMondayAt(19, 20),
        leadMinutes: 45,
      }),
    ).toBe(true);
    expect(
      isKitchenReleased({
        scheduledFor: scheduled,
        now: localMondayAt(19, 0),
        leadMinutes: 45,
      }),
    ).toBe(false);
  });
});
