import { SimulationBootstrapService } from './simulation-bootstrap.service';

describe('SimulationBootstrapService', () => {
  it('crea tenant mínimo con stock/receta y emite JWT', async () => {
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
      { id: 'role-manager', name: 'MANAGER' },
      { id: 'role-kitchen', name: 'KITCHEN' },
    ];
    const mozzarella = { id: 'dish-mozza' };
    const fugazzeta = { id: 'dish-fuga' };
    const inventoryItem = { id: 'inv-masa' };
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
          .mockResolvedValueOnce({ id: 'manager-1' })
          .mockResolvedValueOnce({ id: 'kitchen-1' }),
      },
      restaurantMembership: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
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
        .mockResolvedValueOnce({ token: 'manager-token' })
        .mockResolvedValueOnce({ token: 'kitchen-token' }),
    };
    const service = new SimulationBootstrapService(
      prisma as never,
      rolesCatalog as never,
      auth as never,
    );

    const result = await service.bootstrap({
      scenarioId: 'pizzeria-30m',
      scenarioVersion: '2.0.0',
      repetitionKey: 'viernes-42',
      seedState: '42',
      simulatedStartAt: new Date('2026-07-17T23:00:00.000Z'),
    });

    expect(result.restaurant.slug).toMatch(/^lab-pizzeria-/);
    expect(result.managerToken).toBe('manager-token');
    expect(result.kitchenToken).toBe('kitchen-token');
    expect(result.inventoryItemId).toBe('inv-masa');
    expect(transaction.inventoryItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Masa',
        currentStock: 20,
        autoDisableDishes: true,
        linkedDishIds: ['dish-mozza', 'dish-fuga'],
      }),
    });
    expect(transaction.dishRecipeLine.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          dishId: 'dish-mozza',
          inventoryItemId: 'inv-masa',
          quantity: 1,
        }),
        expect.objectContaining({
          dishId: 'dish-fuga',
          inventoryItemId: 'inv-masa',
          quantity: 1,
        }),
      ]),
    });
    expect(transaction.restaurant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        slug: expect.stringMatching(/^lab-pizzeria-/),
        ownerWhatsappEnabled: false,
        businessRules: expect.objectContaining({
          payment: { methods: ['cash'] },
          inventory: { autoDeductOnSale: true },
        }),
      }),
    });
  });
});
