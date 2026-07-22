import { OrderStatus } from '@prisma/client';
import { SimulationInvariantRegistry } from './simulation-invariant.registry';

describe('NO_OPEN_ORDERS_AT_COMPLETE', () => {
  function buildRegistry(
    openOrders: Array<{
      id: string;
      status: OrderStatus;
      paymentStatus: string;
    }>,
  ) {
    const prisma = {
      simulationRun: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          restaurantId: 'restaurant-1',
        }),
      },
      order: {
        findMany: jest.fn().mockResolvedValue(openOrders),
      },
    };
    const effects = { getAttempts: jest.fn().mockReturnValue([]) };
    return new SimulationInvariantRegistry(prisma as never, effects as never);
  }

  it('PASS cuando no hay pedidos abiertos ni impagos', async () => {
    const registry = buildRegistry([]);
    const [result] = await registry.evaluate('run-1', [
      'NO_OPEN_ORDERS_AT_COMPLETE',
    ]);
    expect(result).toEqual(
      expect.objectContaining({
        key: 'no-open-orders-at-complete',
        status: 'PASS',
      }),
    );
  });

  it('FAIL con sample cuando queda un PENDING', async () => {
    const registry = buildRegistry([
      {
        id: 'order-open-1',
        status: OrderStatus.PENDING,
        paymentStatus: 'PENDING',
      },
    ]);
    const [result] = await registry.evaluate('run-1', [
      'NO_OPEN_ORDERS_AT_COMPLETE',
    ]);
    expect(result?.status).toBe('FAIL');
    expect(result?.detail).toContain('order-open-1');
    expect(result?.detail).toContain('PENDING');
  });

  it('FAIL cuando READY+PAID (aún no entregado)', async () => {
    const registry = buildRegistry([
      {
        id: 'order-ready-1',
        status: OrderStatus.READY,
        paymentStatus: 'PAID',
      },
    ]);
    const [result] = await registry.evaluate('run-1', [
      'NO_OPEN_ORDERS_AT_COMPLETE',
    ]);
    expect(result?.status).toBe('FAIL');
    expect(result?.detail).toContain('READY');
  });
});
