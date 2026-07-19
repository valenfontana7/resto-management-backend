import { SimulationCleanupService } from './simulation-cleanup.service';

describe('SimulationCleanupService', () => {
  it('rechaza limpiar un tenant cuyo slug no pertenece a Lab', async () => {
    const prisma = {
      simulationRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'run-1',
          restaurantId: 'restaurant-1',
          restaurant: { slug: 'tenant-productivo' },
        }),
        update: jest.fn(),
      },
      restaurant: { delete: jest.fn() },
    };
    const service = new SimulationCleanupService(prisma as never, {
      BENTOO_RUNTIME_MODE: 'lab',
    });

    await expect(service.cleanup('run-1', { removeRun: true })).rejects.toThrow(
      /slug/i,
    );
    expect(prisma.restaurant.delete).not.toHaveBeenCalled();
  });

  it('rechaza operar fuera del runtime Lab', async () => {
    const prisma = {
      simulationRun: { findUnique: jest.fn() },
    };
    const service = new SimulationCleanupService(prisma as never, {});

    await expect(service.cleanup('run-1', { removeRun: true })).rejects.toThrow(
      /runtime Lab/i,
    );
  });
});
