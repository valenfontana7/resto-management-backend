import {
  buildFunnelBiggestDrop,
  buildFunnelRecommendations,
} from './onboarding-funnel-insights.utils';

describe('onboarding-funnel-insights.utils', () => {
  it('calcula la mayor caída del funnel', () => {
    const drop = buildFunnelBiggestDrop([
      { event: 'a', uniqueSessions: 100, conversionFromPrev: null },
      { event: 'b', uniqueSessions: 60, conversionFromPrev: 60 },
      { event: 'c', uniqueSessions: 30, conversionFromPrev: 50 },
    ]);

    expect(drop?.event).toBe('c');
    expect(drop?.dropPercent).toBe(50);
    expect(drop?.lostSessions).toBe(30);
  });

  it('prioriza recomendaciones de alta prioridad', () => {
    const recs = buildFunnelRecommendations({
      steps: [
        {
          event: 'register_started',
          uniqueSessions: 10,
          conversionFromPrev: null,
        },
      ],
      highlights: {
        landingToRegisterConversion: 5,
        trialBannerToPaymentIntentConversion: 10,
        trialBannerSessions: 10,
      },
    });

    expect(recs[0]?.priority).toBe('alta');
    expect(recs.some((r) => r.id === 'landing-conversion-low')).toBe(true);
  });
});
