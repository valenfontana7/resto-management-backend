import { SyncOutboxStatus } from '@prisma/client';
import { EdgeSyncOutboxService } from './edge-sync-outbox.service';

describe('EdgeSyncOutboxService', () => {
  const prisma = {
    syncOutbox: {
      upsert: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const service = new EdgeSyncOutboxService(prisma as never);

  beforeEach(() => jest.clearAllMocks());

  it('encola mutación pendiente', async () => {
    await service.enqueue({
      restaurantId: 'rest-1',
      entityType: 'OPEN_SESSION',
      clientMutationId: 'mut-1',
      payload: { tableId: 't-1' },
    });

    expect(prisma.syncOutbox.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          status: SyncOutboxStatus.PENDING,
          entityType: 'OPEN_SESSION',
        }),
      }),
    );
  });

  it('lista pendientes en orden FIFO', async () => {
    prisma.syncOutbox.findMany.mockResolvedValue([{ id: '1' }]);
    const rows = await service.listPending('rest-1', 10);
    expect(rows).toHaveLength(1);
    expect(prisma.syncOutbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
    );
  });
});
