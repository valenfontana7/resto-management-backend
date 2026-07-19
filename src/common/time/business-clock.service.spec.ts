import { BusinessClockService } from './business-clock.service';
import { ExecutionContextService } from '../execution/execution-context.service';

describe('BusinessClockService', () => {
  it('usa tiempo técnico fuera de una ejecución simulada', () => {
    const execution = new ExecutionContextService();
    const clock = new BusinessClockService(execution);
    const before = Date.now();

    const result = clock.now().getTime();

    expect(result).toBeGreaterThanOrEqual(before);
    expect(result).toBeLessThanOrEqual(Date.now());
  });

  it('propaga tiempo y correlación dentro del contexto Lab', async () => {
    const execution = new ExecutionContextService();
    const clock = new BusinessClockService(execution);
    const simulatedNow = new Date('2026-07-17T23:12:00.000Z');

    await execution.run(
      {
        runId: 'run-1',
        participantKey: 'client',
        origin: 'SIMULATED',
        correlationId: 'corr-1',
        simulatedNow,
      },
      async () => {
        await Promise.resolve();
        expect(clock.now()).toEqual(simulatedNow);
        expect(execution.require().correlationId).toBe('corr-1');
      },
    );
  });
});
