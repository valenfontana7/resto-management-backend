import { SimulationRunStatus } from '@prisma/client';
import { LabBusinessDateService } from './lab-business-date.service';

describe('LabBusinessDateService', () => {
  const originalRuntime = process.env.BENTOO_RUNTIME_MODE;

  afterEach(() => {
    if (originalRuntime === undefined) {
      delete process.env.BENTOO_RUNTIME_MODE;
    } else {
      process.env.BENTOO_RUNTIME_MODE = originalRuntime;
    }
  });

  it('devuelve null fuera de Lab', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'normal';
    const prisma = { simulationRun: { findFirst: jest.fn() } };
    const service = new LabBusinessDateService(prisma as never);
    await expect(service.resolveBusinessDateYmd('r1')).resolves.toBeNull();
    expect(prisma.simulationRun.findFirst).not.toHaveBeenCalled();
  });

  it('resuelve YYYY-MM-DD del run Lab más reciente', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'lab';
    const prisma = {
      simulationRun: {
        findFirst: jest.fn().mockResolvedValue({
          simulatedNow: new Date('2026-07-17T23:45:00.000Z'),
        }),
      },
    };
    const service = new LabBusinessDateService(prisma as never);
    await expect(service.resolveBusinessDateYmd('r1')).resolves.toBe(
      '2026-07-17',
    );
    expect(prisma.simulationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          restaurantId: 'r1',
          status: {
            in: [
              SimulationRunStatus.RUNNING,
              SimulationRunStatus.PAUSED,
              SimulationRunStatus.CREATED,
              SimulationRunStatus.COMPLETED,
            ],
          },
        }),
      }),
    );
  });

  it('resolveSimulatedNow expone el instante del run (HITL sin ALS)', async () => {
    process.env.BENTOO_RUNTIME_MODE = 'lab';
    const simulatedNow = new Date('2026-07-17T23:45:00.000Z');
    const prisma = {
      simulationRun: {
        findFirst: jest.fn().mockResolvedValue({ simulatedNow }),
      },
    };
    const service = new LabBusinessDateService(prisma as never);
    await expect(service.resolveSimulatedNow('r1')).resolves.toBe(simulatedNow);
  });
});
