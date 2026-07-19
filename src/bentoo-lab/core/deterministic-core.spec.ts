import { DeterministicEventQueue } from './deterministic-event-queue';
import { XorShift32 } from './prng';
import { normalizeTimeline } from './timeline-normalizer';
import { validateLabScenario } from '../scenarios/scenario-validator';
import { PIZZERIA_FRIDAY_30M_SCENARIO } from '../scenarios/pizzeria-friday-30m.scenario';

describe('núcleo determinístico de Bentoo Lab', () => {
  it('repite la misma secuencia con la misma clave', () => {
    const first = new XorShift32('viernes-42');
    const second = new XorShift32('viernes-42');

    expect(Array.from({ length: 8 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => second.nextUint32()),
    );
  });

  it('restaura exactamente el estado serializado del PRNG', () => {
    const source = new XorShift32('viernes-42');
    source.nextUint32();
    const restored = XorShift32.restore(source.snapshot());

    expect(restored.nextUint32()).toBe(source.nextUint32());
  });

  it('ordena la cola por tiempo, prioridad e id estable', () => {
    const queue = new DeterministicEventQueue<{
      id: string;
      atMs: number;
      priority: number;
    }>();
    queue.enqueue({ id: 'b', atMs: 1000, priority: 1 });
    queue.enqueue({ id: 'c', atMs: 500, priority: 1 });
    queue.enqueue({ id: 'a', atMs: 1000, priority: 1 });
    queue.enqueue({ id: 'z', atMs: 1000, priority: 0 });

    expect(queue.drainReady(1000).map((event) => event.id)).toEqual([
      'c',
      'z',
      'a',
      'b',
    ]);
  });

  it('valida el escenario vertical de pizzería', () => {
    expect(validateLabScenario(PIZZERIA_FRIDAY_30M_SCENARIO)).toEqual(
      PIZZERIA_FRIDAY_30M_SCENARIO,
    );
  });

  it('normaliza IDs físicos y tiempo real fuera de la comparación', () => {
    const normalized = normalizeTimeline(
      [
        {
          sequence: 1,
          logicalEventId: 'client.order.0001',
          logicalEntityKey: 'order.online.0001',
          simulatedAt: new Date('2026-07-17T23:02:00.000Z'),
          realAt: new Date('2030-01-01T00:00:00.000Z'),
          participantKey: 'client',
          domain: 'orders',
          action: 'order.create',
          resultCode: 'CREATED',
          entityId: 'physical-id',
          correlationId: 'physical-correlation',
          summary: 'Pedido creado',
        },
      ],
      new Date('2026-07-17T23:00:00.000Z'),
    );

    expect(normalized).toEqual([
      {
        sequence: 1,
        offsetMs: 120000,
        logicalEventId: 'client.order.0001',
        logicalEntityKey: 'order.online.0001',
        participantKey: 'client',
        domain: 'orders',
        action: 'order.create',
        resultCode: 'CREATED',
        summary: 'Pedido creado',
      },
    ]);
  });
});
