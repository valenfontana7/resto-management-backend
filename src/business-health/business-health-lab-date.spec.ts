import { BusinessHealthService } from './business-health.service';

describe('BusinessHealthService Lab date', () => {
  const originalRuntime = process.env.BENTOO_RUNTIME_MODE;

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.BENTOO_RUNTIME_MODE;
    } else {
      process.env.BENTOO_RUNTIME_MODE = originalRuntime;
    }
    jest.restoreAllMocks();
  });

  it('ancla el rolling 30d de getDashboard al simulatedNow Lab', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'lab';
    const labNow = new Date('2026-07-17T23:30:00.000Z');
    const labBusinessDate = {
      resolveSimulatedNow: jest.fn().mockResolvedValue(labNow),
    };

    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const findFirst = jest.fn().mockResolvedValue(null);
    const findUnique = jest.fn().mockResolvedValue({ businessRules: {} });
    const queryRaw = jest.fn().mockResolvedValue([]);

    const prisma = {
      dish: { findMany },
      orderItem: { findMany },
      order: { findMany },
      inventoryItem: { findMany },
      tableSession: { count },
      cashRegisterSession: { findFirst },
      restaurantCustomerProfile: { findMany },
      restaurant: { findUnique },
      winBackEmailLog: { findFirst, count },
      $queryRaw: queryRaw,
    };

    const ownership = {
      verifyUserBelongsToRestaurant: jest.fn().mockResolvedValue(undefined),
    };
    const alerts = {
      syncFromDashboard: jest.fn().mockResolvedValue(undefined),
    };

    const service = new BusinessHealthService(
      prisma as never,
      ownership as never,
      {} as never,
      {} as never,
      alerts as never,
      {} as never,
      labBusinessDate as never,
    );

    await service.getDashboard('rest-1', 'user-1');

    expect(labBusinessDate.resolveSimulatedNow).toHaveBeenCalledWith('rest-1');

    const periodStart = new Date(labNow);
    periodStart.setDate(periodStart.getDate() - 30);

    const orderCalls = findMany.mock.calls.filter(
      (call) =>
        call[0]?.where?.createdAt?.gte instanceof Date &&
        call[0]?.where?.restaurantId === 'rest-1' &&
        call[0]?.where?.status,
    );
    expect(orderCalls.length).toBeGreaterThan(0);
    const gte = orderCalls[0][0].where.createdAt.gte as Date;
    expect(gte.toISOString()).toBe(periodStart.toISOString());
  });
});
