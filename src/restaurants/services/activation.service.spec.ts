import { ActivationService } from './activation.service';

describe('ActivationService.getActivationState', () => {
  const service = new ActivationService({} as never, {} as never);

  it('returns empty activation when rules missing', () => {
    const state = service.getActivationState(null);
    expect(state.hasFirstValue).toBe(false);
    expect(state.activationPath).toBeNull();
    expect(state.score).toBe(0);
    expect(state.scoreBand).toBe('cold');
    expect(state.operationalModel).toBe('mixed');
    expect(state.nextMilestone?.id).toBe('channel_live');
  });

  it('reads nested activation slice and computes score', () => {
    const state = service.getActivationState({
      onboarding: {
        productIntent: 'digital',
        activation: {
          activationPath: 'digital',
          activationStartedAt: '2026-07-17T10:00:00.000Z',
          firstValueAt: '2026-07-17T10:05:00.000Z',
          firstValueType: 'digital_publish',
          milestones: {
            channel_live: '2026-07-17T10:05:00.000Z',
          },
        },
      },
    });

    expect(state.hasFirstValue).toBe(true);
    expect(state.firstValueType).toBe('digital_publish');
    expect(state.productIntent).toBe('digital');
    expect(state.operationalModel).toBe('digital');
    expect(state.score).toBe(35);
    expect(state.scoreBand).toBe('warming');
    expect(state.nextMilestone?.id).toBe('real_ops_action');
  });
});
