import { EdgeSyncPullApplyService } from './edge-sync-pull-apply.service';

describe('EdgeSyncPullApplyService', () => {
  const prisma = {
    category: { upsert: jest.fn() },

    dish: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },

    tableArea: { upsert: jest.fn() },

    table: { upsert: jest.fn(), updateMany: jest.fn() },

    restaurant: { update: jest.fn() },

    syncLocalCursor: { upsert: jest.fn(), findMany: jest.fn() },

    syncOutbox: { findMany: jest.fn().mockResolvedValue([]) },

    tableSession: {
      findMany: jest.fn().mockResolvedValue([]),

      findUnique: jest.fn(),

      findFirst: jest.fn(),

      updateMany: jest.fn(),

      create: jest.fn(),

      delete: jest.fn(),
    },

    tableSessionItem: {
      deleteMany: jest.fn(),

      create: jest.fn(),
    },

    $transaction: jest.fn((ops: unknown) => {
      if (Array.isArray(ops)) {
        return Promise.all(
          ops.map((op) => (typeof op === 'function' ? op() : op)),
        );
      }

      return Promise.resolve(ops);
    }),
  };

  const service = new EdgeSyncPullApplyService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('aplica stream de menú', async () => {
    const result = await service.applyStreams('rest-1', {
      menu: {
        items: [
          {
            id: 'cat-1',

            name: 'Principales',

            order: 0,

            dishes: [
              {
                id: 'dish-1',

                name: 'Milanesa',

                price: 12000,

                isAvailable: true,

                isAvailableInSalon: true,
              },
            ],
          },
        ],

        cursor: '2026-07-10T00:00:00.000Z',
      },
    });

    expect(result.applied).toContain('menu');

    expect(prisma.category.upsert).toHaveBeenCalled();

    expect(prisma.dish.upsert).toHaveBeenCalled();
  });

  it('guarda cursores por stream', async () => {
    await service.saveCursors('rest-1', {
      menu: {
        items: [],

        cursor: '2026-07-10T00:00:00.000Z',
      },
    });

    expect(prisma.syncLocalCursor.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          restaurantId_streamKey: {
            restaurantId: 'rest-1',

            streamKey: 'menu',
          },
        },
      }),
    );
  });

  it('reconcilia floor_sessions desde cloud', async () => {
    prisma.tableSession.findUnique.mockResolvedValue(null);

    prisma.tableSession.findMany.mockResolvedValue([]);

    const result = await service.applyStreams('rest-1', {
      floor_sessions: {
        items: [
          {
            id: 'sess-cloud-1',

            tableId: 'table-1',

            sessionNumber: 'M-001',

            status: 'OPEN',

            subtotal: 5000,

            total: 5000,

            openedAt: '2026-07-10T12:00:00.000Z',

            items: [
              {
                id: 'item-1',

                dishId: 'dish-1',

                quantity: 1,

                unitPrice: 5000,

                subtotal: 5000,

                kitchenStatus: 'PENDING',
              },
            ],
          },
        ],

        cursor: '2026-07-10T12:00:00.000Z',
      },
    });

    expect(result.applied).toContain('floor_sessions');

    expect(prisma.tableSession.create).toHaveBeenCalled();

    expect(prisma.tableSessionItem.deleteMany).toHaveBeenCalled();
  });

  it('no borra sesiones locales con outbox pendiente', async () => {
    prisma.syncOutbox.findMany.mockResolvedValue([
      {
        entityType: 'ADD_ITEMS',

        payload: { sessionId: 'sess-local-1' },
      },
    ]);

    prisma.tableSession.findMany.mockResolvedValue([{ id: 'sess-local-1' }]);

    await service.applyStreams('rest-1', {
      floor_sessions: {
        items: [],

        cursor: '2026-07-10T12:00:00.000Z',
      },
    });

    expect(prisma.tableSession.delete).not.toHaveBeenCalled();
  });
});
