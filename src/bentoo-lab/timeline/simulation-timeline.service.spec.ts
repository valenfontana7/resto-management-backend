import { SimulationTimelineService } from './simulation-timeline.service';

describe('SimulationTimelineService', () => {
  it('asigna secuencia contigua y sanitiza el resumen', async () => {
    const created = { id: 'timeline-3', sequence: 3 };
    const prisma = {
      simulationTimelineEvent: {
        findFirst: jest.fn().mockResolvedValue({ sequence: 2 }),
        create: jest.fn().mockResolvedValue(created),
      },
    };
    const service = new SimulationTimelineService(prisma as never);

    const result = await service.append('run-1', {
      logicalEventId: 'client.order.0001',
      logicalEntityKey: 'order.online.0001',
      simulatedAt: new Date('2026-07-17T23:02:00.000Z'),
      participantKey: 'client',
      domain: 'orders',
      action: 'order.create',
      resultCode: 'CREATED',
      correlationId: 'corr-1',
      summary: 'Pedido\ncreado',
    });

    expect(result).toBe(created);
    expect(prisma.simulationTimelineEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId: 'run-1',
        sequence: 3,
        summary: 'Pedido creado',
      }),
    });
  });
});
