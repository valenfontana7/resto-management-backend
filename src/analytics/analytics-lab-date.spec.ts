import { AnalyticsService } from './analytics.service';

describe('AnalyticsService Lab date', () => {
  const originalRuntime = process.env.BENTOO_RUNTIME_MODE;

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.BENTOO_RUNTIME_MODE;
    } else {
      process.env.BENTOO_RUNTIME_MODE = originalRuntime;
    }
  });

  it('ancla period=today al simulatedNow del run Lab', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'lab';
    const labBusinessDate = {
      resolveSimulatedNow: jest
        .fn()
        .mockResolvedValue(new Date('2026-07-17T23:30:00.000Z')),
    };
    const service = new AnalyticsService({} as never, labBusinessDate as never);

    const api = service as unknown as {
      resolveNowInTimeZone: (restaurantId: string) => Promise<Date>;
      getDateRange: (
        restaurantId: string,
        period: string,
      ) => Promise<{ start: Date; end: Date }>;
    };

    const now = await api.resolveNowInTimeZone('r1');
    const range = await api.getDateRange('r1', 'today');

    expect(labBusinessDate.resolveSimulatedNow).toHaveBeenCalledWith('r1');
    expect(range.start.getFullYear()).toBe(now.getFullYear());
    expect(range.start.getMonth()).toBe(now.getMonth());
    expect(range.start.getDate()).toBe(now.getDate());
    expect(range.start.getHours()).toBe(0);
    expect(range.start.getMinutes()).toBe(0);
    expect(range.end.getHours()).toBe(23);
    expect(range.end.getMinutes()).toBe(59);
  });
});
