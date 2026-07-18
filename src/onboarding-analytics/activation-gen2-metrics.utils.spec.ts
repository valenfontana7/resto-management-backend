import {
  computeGen2MetricsFromCohort,
  parseActivationFromBusinessRules,
} from './activation-gen2-metrics.utils';

describe('activation-gen2-metrics.utils', () => {
  const createdAt = new Date('2026-07-10T12:00:00.000Z');

  it('parsea slice de activación desde businessRules', () => {
    const parsed = parseActivationFromBusinessRules({
      onboarding: {
        activation: {
          firstValueAt: '2026-07-10T12:05:00.000Z',
          firstValueType: 'digital_publish',
          score: 45,
          milestones: { real_ops_action: '2026-07-11T10:00:00.000Z' },
        },
      },
    });

    expect(parsed.firstValueAt).toBe('2026-07-10T12:05:00.000Z');
    expect(parsed.firstValueType).toBe('digital_publish');
    expect(parsed.scoreBand).toBe('warming');
    expect(parsed.realOpsActionAt).toBe('2026-07-11T10:00:00.000Z');
  });

  it('calcula TTFV, ACR, WMR, SSR y distribución de score', () => {
    const metrics = computeGen2MetricsFromCohort([
      {
        id: 'r1',
        createdAt,
        businessRules: {
          onboarding: {
            activation: {
              firstValueAt: '2026-07-10T12:05:00.000Z',
              firstValueType: 'digital_publish',
              secondSessionAt: '2026-07-11T14:00:00.000Z',
              scoreBand: 'activated',
              milestones: {
                real_ops_action: '2026-07-11T10:00:00.000Z',
              },
            },
          },
        },
      },
      {
        id: 'r2',
        createdAt,
        businessRules: {
          onboarding: {
            activation: {
              firstValueAt: '2026-07-12T12:00:00.000Z',
              scoreBand: 'cold',
            },
          },
        },
      },
      {
        id: 'r3',
        createdAt,
        businessRules: { onboarding: { activation: {} } },
      },
    ]);

    expect(metrics.medianTtfvMinutes).toBe(1442.5);
    expect(metrics.ttfvP75Minutes).toBe(2161.3);
    expect(metrics.ttfvSampleSize).toBe(2);
    expect(metrics.acr24hPercent).toBe(33.3);
    expect(metrics.acr7dPercent).toBe(66.7);
    expect(metrics.wowMomentRatePercent).toBe(66.7);
    expect(metrics.secondSessionRatePercent).toBe(50);
    expect(metrics.scoreDistribution.activated).toBe(1);
    expect(metrics.scoreDistribution.cold).toBe(1);
    expect(metrics.highRetentionSignalCount).toBe(1);
  });
});
