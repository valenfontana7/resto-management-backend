import {
  inferFocusAreasFromFeatures,
  inferProfileFromLegacy,
  mapProductIntentToModel,
} from './operational-profile-inference';

describe('operational-profile-inference', () => {
  it('maps productIntent digital to operational model digital', () => {
    expect(mapProductIntentToModel('digital')).toBe('digital');
  });

  it('maps productIntent operations to salon', () => {
    expect(mapProductIntentToModel('operations')).toBe('salon');
  });

  it('infers delivery focus from features', () => {
    const areas = inferFocusAreasFromFeatures(
      { delivery: true, orders: true },
      'digital',
    );
    expect(areas).toContain('delivery_logistics');
  });

  it('migrates legacy restaurant with productIntent', () => {
    const profile = inferProfileFromLegacy({
      id: 'r1',
      businessRules: { onboarding: { productIntent: 'operations' } },
      features: { salon: true, orders: true },
      onboardingIncomplete: false,
      createdAt: new Date('2026-01-01'),
      _count: { orders: 12 },
    });

    expect(profile.operationalModel).toBe('salon');
    expect(profile.profileStatus).toBe('completed');
    expect(profile.migratedFromLegacy).toBe(true);
    expect(profile.completedStepIds).toContain('v1:model');
  });

  it('defaults to mixed when productIntent is missing', () => {
    const profile = inferProfileFromLegacy({
      id: 'r2',
      businessRules: null,
      features: { orders: true },
      onboardingIncomplete: true,
      createdAt: new Date('2026-06-01'),
      _count: { orders: 0 },
    });

    expect(profile.operationalModel).toBe('mixed');
    expect(profile.profileStatus).toBe('completed');
  });

  it('infers salon focus from table sessions signal', () => {
    const areas = inferFocusAreasFromFeatures(
      { salon: true, tables: true, orders: true },
      'salon',
    );
    expect(areas).toContain('floor_service');
  });

  it('promotes maturity when onboarding incomplete but has orders', () => {
    const profile = inferProfileFromLegacy({
      id: 'r3',
      businessRules: { onboarding: { productIntent: 'both' } },
      features: { orders: true, delivery: true },
      onboardingIncomplete: true,
      createdAt: new Date('2026-01-01'),
      _count: { orders: 10 },
    });

    expect(profile.maturityLevel).toBe('intermediate');
    expect(profile.profileStatus).toBe('completed');
  });
});
