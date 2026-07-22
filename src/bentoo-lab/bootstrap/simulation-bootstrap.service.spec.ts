import { SimulationBootstrapService } from './simulation-bootstrap.service';

describe('SimulationBootstrapService', () => {
  function buildMocks(options?: { withWaiter?: boolean }) {
    const withWaiter = options?.withWaiter ?? true;
    const run = {
      id: 'run-abc12345',
      scenarioId: 'pizzeria-30m',
      scenarioVersion: '2.0.0',
    };
    const restaurant = {
      id: 'restaurant-1',
      slug: 'lab-pizzeria-abc12345',
    };
    const roles = [
      { id: 'role-owner', name: 'OWNER' },
      { id: 'role-manager', name: 'MANAGER' },
      { id: 'role-kitchen', name: 'KITCHEN' },
      ...(withWaiter ? [{ id: 'role-waiter', name: 'WAITER' }] : []),
    ];
    const mozzarella = { id: 'dish-mozza' };
    const fugazzeta = { id: 'dish-fuga' };
    const inventoryItem = { id: 'inv-masa' };
    const area = { id: 'area-1' };
    const tables = Array.from({ length: 8 }, (_, i) => ({
      id: `table-${i + 1}`,
      number: String(i + 1),
    }));
    const transaction = {
      restaurant: { create: jest.fn().mockResolvedValue(restaurant) },
      category: { create: jest.fn().mockResolvedValue({ id: 'category-1' }) },
      dish: {
        create: jest
          .fn()
          .mockResolvedValueOnce(mozzarella)
          .mockResolvedValueOnce(fugazzeta),
      },
      inventoryItem: { create: jest.fn().mockResolvedValue(inventoryItem) },
      dishRecipeLine: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      role: { findMany: jest.fn().mockResolvedValue(roles) },
      user: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'owner-1', name: 'Owner Bentoo Lab' })
          .mockResolvedValueOnce({
            id: 'manager-1',
            name: 'Encargado Bentoo Lab',
          })
          .mockResolvedValueOnce({ id: 'kitchen-1', name: 'Cocina Bentoo Lab' })
          .mockResolvedValueOnce({ id: 'waiter-1', name: 'Mozo Bentoo Lab' }),
      },
      restaurantMembership: {
        createMany: jest.fn().mockResolvedValue({ count: withWaiter ? 4 : 3 }),
      },
      dailyOperation: {
        create: jest.fn().mockResolvedValue({ id: 'daily-1' }),
      },
      cashRegisterSession: {
        create: jest.fn().mockResolvedValue({ id: 'cash-1' }),
      },
      tableArea: { create: jest.fn().mockResolvedValue(area) },
      table: {
        create: jest
          .fn()
          .mockImplementation(
            async ({ data }: { data: { number: string } }) => {
              const found = tables.find((t) => t.number === data.number);
              return (
                found ?? { id: `table-${data.number}`, number: data.number }
              );
            },
          ),
        update: jest.fn().mockResolvedValue({}),
      },
      tableSession: {
        create: jest
          .fn()
          .mockResolvedValueOnce({ id: 'session-1' })
          .mockResolvedValueOnce({ id: 'session-2' }),
      },
      deliveryZone: {
        create: jest.fn().mockResolvedValue({ id: 'zone-lab-1' }),
      },
      reservation: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      coupon: {
        create: jest.fn().mockResolvedValue({ id: 'coupon-lab10' }),
      },
      review: {
        create: jest.fn().mockResolvedValue({ id: 'review-seed-1' }),
      },
      builderConfig: {
        create: jest.fn().mockResolvedValue({ id: 'builder-1' }),
      },
      simulationRun: { update: jest.fn().mockResolvedValue(run) },
    };
    const prisma = {
      simulationRun: {
        create: jest.fn().mockResolvedValue(run),
        update: jest.fn().mockResolvedValue(run),
      },
      $transaction: jest
        .fn()
        .mockImplementation(
          async (callback: (tx: typeof transaction) => unknown) =>
            callback(transaction),
        ),
    };
    const rolesCatalog = { ensureSystemRoles: jest.fn() };
    const auth = {
      createAuthResponseForUserId: jest
        .fn()
        .mockResolvedValueOnce({ token: 'owner-token' })
        .mockResolvedValueOnce({ token: 'manager-token' })
        .mockResolvedValueOnce({ token: 'kitchen-token' })
        .mockResolvedValueOnce({ token: 'waiter-token' }),
    };
    const service = new SimulationBootstrapService(
      prisma as never,
      rolesCatalog as never,
      auth as never,
    );
    return { service, transaction, auth };
  }

  it('crea tenant ops-core con owner, mesas, mozo y JWT', async () => {
    const { service, transaction, auth } = buildMocks({ withWaiter: true });

    const result = await service.bootstrap({
      scenarioId: 'pizzeria-30m',
      scenarioVersion: '2.0.0',
      repetitionKey: 'viernes-42',
      seedState: '42',
      simulatedStartAt: new Date('2026-07-17T23:00:00.000Z'),
      labProfile: 'ops-core',
    });

    expect(result.labProfile).toBe('ops-core');
    expect(result.restaurant.slug).toMatch(/^lab-pizzeria-/);
    expect(result.ownerToken).toBe('owner-token');
    expect(result.ownerUserId).toBe('owner-1');
    expect(result.managerToken).toBe('manager-token');
    expect(result.kitchenToken).toBe('kitchen-token');
    expect(result.waiterToken).toBe('waiter-token');
    expect(result.waiterUserId).toBe('waiter-1');
    expect(result.deliveryZoneId).toBe('zone-lab-1');
    expect(transaction.tableArea.create).toHaveBeenCalled();
    expect(transaction.table.create).toHaveBeenCalledTimes(8);
    expect(transaction.dailyOperation.create).toHaveBeenCalled();
    expect(transaction.cashRegisterSession.create).toHaveBeenCalled();
    expect(transaction.tableSession.create).toHaveBeenCalledTimes(2);
    expect(transaction.deliveryZone.create).toHaveBeenCalled();
    expect(transaction.reservation.createMany).toHaveBeenCalled();
    expect(transaction.coupon.create).toHaveBeenCalled();
    expect(transaction.review.create).toHaveBeenCalled();
    expect(transaction.builderConfig.create).toHaveBeenCalled();
    expect(auth.createAuthResponseForUserId).toHaveBeenCalledTimes(4);
    expect(transaction.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        features: expect.objectContaining({
          salon: true,
          tables: true,
          delivery: true,
          reservations: true,
          loyalty: true,
          reviews: true,
        }),
        businessRules: expect.objectContaining({
          payment: { methods: ['cash', 'digital-wallet'] },
          fiscal: expect.objectContaining({
            cuit: '20111111112',
          }),
          delivery: { enabled: true },
        }),
      }),
    });
  });

  it('crea tenant minimal con owner sin salón ni mozo', async () => {
    const { service, transaction, auth } = buildMocks({ withWaiter: false });
    auth.createAuthResponseForUserId = jest
      .fn()
      .mockResolvedValueOnce({ token: 'owner-token' })
      .mockResolvedValueOnce({ token: 'manager-token' })
      .mockResolvedValueOnce({ token: 'kitchen-token' });

    const result = await service.bootstrap({
      scenarioId: 'pizzeria-30m',
      scenarioVersion: '2.0.0',
      repetitionKey: 'minimal-1',
      seedState: '1',
      simulatedStartAt: new Date('2026-07-17T23:00:00.000Z'),
      labProfile: 'minimal',
    });

    expect(result.labProfile).toBe('minimal');
    expect(result.ownerToken).toBe('owner-token');
    expect(result.waiterToken).toBeNull();
    expect(transaction.tableArea.create).not.toHaveBeenCalled();
    expect(auth.createAuthResponseForUserId).toHaveBeenCalledTimes(3);
  });
});
