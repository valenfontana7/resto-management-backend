import { getSchedulerOptions, isLabRuntime } from './bentoo-mode.config';

describe('modo de ejecución Bentoo', () => {
  it('reconoce Lab explícitamente', () => {
    expect(isLabRuntime({ BENTOO_RUNTIME_MODE: 'lab' })).toBe(true);
    expect(isLabRuntime({})).toBe(false);
  });

  it('desactiva todos los schedulers en Lab', () => {
    expect(getSchedulerOptions({ BENTOO_RUNTIME_MODE: 'lab' })).toEqual({
      cronJobs: false,
      intervals: false,
      timeouts: false,
    });
  });

  it('conserva los schedulers fuera de Lab', () => {
    expect(getSchedulerOptions({})).toEqual({
      cronJobs: true,
      intervals: true,
      timeouts: true,
    });
  });
});
