import { OrderAnalyticsService } from './order-analytics.service';

describe('OrderAnalyticsService Lab date', () => {
  it('sin date usa businessDate Lab', async () => {
    const ownership = {
      verifyUserBelongsToRestaurant: jest.fn().mockResolvedValue(undefined),
    };
    const labBusinessDate = {
      resolveBusinessDateYmd: jest.fn().mockResolvedValue('2026-07-17'),
    };
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 1000 } }),
        count: jest.fn().mockResolvedValue(2),
      },
      reservation: {
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const service = new OrderAnalyticsService(
      prisma as never,
      ownership as never,
      labBusinessDate as never,
    );

    await service.getTodayStats('restaurant-1', 'user-1');

    expect(labBusinessDate.resolveBusinessDateYmd).toHaveBeenCalledWith(
      'restaurant-1',
    );
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2026-07-17T00:00:00.000Z'),
            lt: new Date('2026-07-18T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('getStats usa businessDate Lab para todayOrders', async () => {
    const ownership = {
      verifyUserBelongsToRestaurant: jest.fn().mockResolvedValue(undefined),
    };
    const labBusinessDate = {
      resolveBusinessDateYmd: jest.fn().mockResolvedValue('2026-07-17'),
    };
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 500 } }),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const service = new OrderAnalyticsService(
      prisma as never,
      ownership as never,
      labBusinessDate as never,
    );

    await service.getStats('restaurant-1', 'user-1');

    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2026-07-17T00:00:00.000Z'),
            lt: new Date('2026-07-18T00:00:00.000Z'),
          },
        }),
      }),
    );
  });

  it('?date= explícito gana sobre Lab', async () => {
    const ownership = {
      verifyUserBelongsToRestaurant: jest.fn().mockResolvedValue(undefined),
    };
    const labBusinessDate = {
      resolveBusinessDateYmd: jest.fn().mockResolvedValue('2026-07-17'),
    };
    const prisma = {
      order: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { total: 0 } }),
        count: jest.fn().mockResolvedValue(0),
      },
      reservation: {
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new OrderAnalyticsService(
      prisma as never,
      ownership as never,
      labBusinessDate as never,
    );

    await service.getTodayStats('restaurant-1', 'user-1', '2026-07-20');

    expect(labBusinessDate.resolveBusinessDateYmd).not.toHaveBeenCalled();
    expect(prisma.order.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: new Date('2026-07-20T00:00:00.000Z'),
            lt: new Date('2026-07-21T00:00:00.000Z'),
          },
        }),
      }),
    );
  });
});
