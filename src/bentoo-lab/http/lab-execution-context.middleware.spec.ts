import { ExecutionContextService } from '../../common/execution/execution-context.service';
import { LabExecutionContextMiddleware } from './lab-execution-context.middleware';

describe('LabExecutionContextMiddleware', () => {
  it('propaga el contexto de un request loopback autenticado', () => {
    const execution = new ExecutionContextService();
    const middleware = new LabExecutionContextMiddleware(execution, {
      BENTOO_RUNTIME_MODE: 'lab',
      BENTOO_LAB_INTERNAL_TOKEN: 'internal-lab-token-1234',
    });
    const request = {
      headers: {
        'x-bentoo-lab-run': 'run-1',
        'x-bentoo-lab-participant': 'client',
        'x-bentoo-lab-origin': 'SIMULATED',
        'x-bentoo-lab-simulated-at': '2026-07-17T23:02:00.000Z',
        'x-bentoo-lab-internal-token': 'internal-lab-token-1234',
        'x-correlation-id': 'corr-1',
      },
    };

    middleware.use(request as never, {} as never, () => {
      expect(execution.require()).toEqual({
        runId: 'run-1',
        participantKey: 'client',
        origin: 'SIMULATED',
        correlationId: 'corr-1',
        simulatedNow: new Date('2026-07-17T23:02:00.000Z'),
      });
    });
  });

  it('rechaza un token interno inválido', () => {
    const execution = new ExecutionContextService();
    const middleware = new LabExecutionContextMiddleware(execution, {
      BENTOO_RUNTIME_MODE: 'lab',
      BENTOO_LAB_INTERNAL_TOKEN: 'internal-lab-token-1234',
    });
    const request = {
      headers: {
        'x-bentoo-lab-run': 'run-1',
        'x-bentoo-lab-internal-token': 'wrong',
      },
    };

    expect(() =>
      middleware.use(request as never, {} as never, jest.fn()),
    ).toThrow(/token/i);
  });
});
