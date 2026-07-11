import {
  computeTenantHealthScore,
  emptyBandCounts,
  resolveHealthBand,
  resolveHealthPlaybook,
} from './tenant-health-scoring';

describe('tenant-health-scoring', () => {
  const fullMetrics = {
    isPublished: true,
    hasOnlinePayments: true,
    ordersLast30d: 12,
    usersActiveLast7d: 4,
    subscriptionStatus: 'ACTIVE',
  };

  it('scores full activation at 100', () => {
    expect(computeTenantHealthScore(fullMetrics)).toBe(100);
  });

  it('scores empty tenant at 0', () => {
    expect(
      computeTenantHealthScore({
        isPublished: false,
        hasOnlinePayments: false,
        ordersLast30d: 0,
        usersActiveLast7d: 0,
        subscriptionStatus: null,
      }),
    ).toBe(0);
  });

  it('maps score bands', () => {
    expect(resolveHealthBand(85)).toBe('healthy');
    expect(resolveHealthBand(70)).toBe('attention');
    expect(resolveHealthBand(50)).toBe('at_risk');
    expect(resolveHealthBand(20)).toBe('critical');
  });

  it('returns structured playbooks per band', () => {
    const critical = resolveHealthPlaybook('critical', {
      isPublished: false,
      hasOnlinePayments: false,
      ordersLast30d: 0,
      usersActiveLast7d: 0,
      subscriptionStatus: null,
    });
    expect(critical.id).toBe('cs-critical-go-live');
    expect(critical.steps.length).toBeGreaterThan(0);
    expect(critical.actions.map((a) => a.key)).toContain('impersonate');

    const healthy = resolveHealthPlaybook('healthy', fullMetrics);
    expect(healthy.id).toBe('cs-healthy-upsell');
    expect(healthy.actions).toHaveLength(1);
  });

  it('initializes empty band counts', () => {
    expect(emptyBandCounts()).toEqual({
      healthy: 0,
      attention: 0,
      at_risk: 0,
      critical: 0,
    });
  });
});
