import {
  EXTERNAL_BOUNDARIES,
  REQUIRED_LAB_BOUNDARIES,
} from './external-boundary.registry';
import { LabEffectsPolicyService } from './lab-effects-policy.service';

describe('LabEffectsPolicyService', () => {
  it('mantiene política explícita para todas las fronteras obligatorias', () => {
    expect(
      REQUIRED_LAB_BOUNDARIES.every((boundary) =>
        EXTERNAL_BOUNDARIES.some((entry) => entry.id === boundary),
      ),
    ).toBe(true);
  });

  it('bloquea y registra un efecto externo en Lab', () => {
    const policy = new LabEffectsPolicyService({
      BENTOO_RUNTIME_MODE: 'lab',
    });

    expect(policy.authorize('EMAIL_RESEND', { runId: 'run-1' })).toEqual({
      allowed: false,
      result: 'BLOCKED',
    });
    expect(policy.getAttempts()).toEqual([
      expect.objectContaining({
        boundary: 'EMAIL_RESEND',
        result: 'BLOCKED',
        runId: 'run-1',
      }),
    ]);
  });

  it('falla cerrado ante una frontera desconocida en Lab', () => {
    const policy = new LabEffectsPolicyService({
      BENTOO_RUNTIME_MODE: 'lab',
    });

    expect(() =>
      policy.authorize('UNKNOWN_BOUNDARY' as never, { runId: 'run-1' }),
    ).toThrow(/registrada/i);
  });

  it('conserva ALLOW fuera de Lab', () => {
    const policy = new LabEffectsPolicyService({});

    expect(policy.authorize('EMAIL_RESEND')).toEqual({
      allowed: true,
      result: 'ALLOWED',
    });
  });
});
