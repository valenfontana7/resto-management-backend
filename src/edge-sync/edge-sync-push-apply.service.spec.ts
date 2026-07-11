import { BadRequestException } from '@nestjs/common';
import { EdgeSyncPushApplyService } from './edge-sync-push-apply.service';
import { FloorIdempotencyService } from '../floor/services/floor-idempotency.service';
import { TableSessionService } from '../floor/services/table-session.service';

describe('EdgeSyncPushApplyService', () => {
  const openMock = jest.fn();
  const addItemsMock = jest.fn();
  const sendToKitchenMock = jest.fn();
  const closeMock = jest.fn();
  const voidSessionMock = jest.fn();

  const tableSessions = {
    open: openMock,
    addItems: addItemsMock,
    sendToKitchen: sendToKitchenMock,
    close: closeMock,
    voidSession: voidSessionMock,
  } as unknown as TableSessionService;

  const idempotency = {
    run: jest.fn(
      async (
        _restaurantId: string,
        _clientMutationId: string | undefined,
        _mutationType: string,
        handler: () => Promise<unknown>,
      ) => handler(),
    ),
  } as unknown as FloorIdempotencyService;

  const prisma = {
    restaurantMembership: {
      findFirst: jest.fn().mockResolvedValue({ userId: 'owner-1' }),
    },
    tableSession: {
      findFirst: jest.fn(),
    },
  };

  const service = new EdgeSyncPushApplyService(
    prisma as never,
    tableSessions,
    idempotency,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.restaurantMembership.findFirst.mockResolvedValue({
      userId: 'owner-1',
    });
  });

  it('rechaza mutación sin clientMutationId', async () => {
    const result = await service.applyMutation('rest-1', {
      clientMutationId: '   ',
      entityType: 'OPEN_SESSION',
      payload: { tableId: 'table-1' },
    });

    expect(result).toEqual({ ok: false, reason: 'missing_clientMutationId' });
  });

  it('aplica OPEN_SESSION con payload plano', async () => {
    openMock.mockResolvedValue({ session: { id: 's1' } });

    const result = await service.applyMutation('rest-1', {
      clientMutationId: 'mut-1',
      entityType: 'OPEN_SESSION',
      payload: {
        tableId: 'table-1',
        guestCount: 3,
        waiterName: 'Ana',
      },
    });

    expect(result.ok).toBe(true);
    expect(openMock).toHaveBeenCalledWith(
      'rest-1',
      'owner-1',
      expect.objectContaining({
        tableId: 'table-1',
        guestCount: 3,
        waiterName: 'Ana',
        clientMutationId: 'mut-1',
      }),
      'Ana',
    );
  });

  it('aplica ADD_ITEMS con body anidado estilo Salon.Local', async () => {
    addItemsMock.mockResolvedValue({ session: { id: 's1' } });

    const result = await service.applyMutation('rest-1', {
      clientMutationId: 'mut-2',
      entityType: 'ADD_ITEMS',
      payload: {
        sessionId: 'session-1',
        body: {
          items: [{ dishId: 'dish-1', quantity: 2, sendToKitchen: true }],
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(addItemsMock).toHaveBeenCalledWith(
      'rest-1',
      'session-1',
      'owner-1',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            dishId: 'dish-1',
            quantity: 2,
            sendToKitchen: true,
          }),
        ],
      }),
    );
  });

  it('acepta CLOSE_SESSION ya cerrada como idempotente', async () => {
    prisma.tableSession.findFirst.mockResolvedValue({
      id: 'session-1',
      status: 'CLOSED',
    });

    const result = await service.applyMutation('rest-1', {
      clientMutationId: 'mut-3',
      entityType: 'CLOSE_SESSION',
      payload: {
        sessionId: 'session-1',
        body: { paymentMethod: 'cash' },
      },
    });

    expect(result).toEqual({ ok: true, result: { alreadyClosed: true } });
    expect(closeMock).not.toHaveBeenCalled();
  });

  it('mapea errores de validación a reason legible', async () => {
    openMock.mockRejectedValue(
      new BadRequestException('La mesa ya tiene una cuenta abierta'),
    );

    const result = await service.applyMutation('rest-1', {
      clientMutationId: 'mut-4',
      entityType: 'OPEN_SESSION',
      payload: { tableId: 'table-1' },
    });

    expect(result).toEqual({
      ok: false,
      reason: 'La mesa ya tiene una cuenta abierta',
    });
  });
});
