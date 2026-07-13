import type { ExperienceBuilderInput } from './experience.types';
import { resolveProfileId } from './resolve-profile-id';

describe('resolveProfileId', () => {
  const baseInput = (): ExperienceBuilderInput => ({
    restaurantId: 'r1',
    capabilities: { features: {}, businessRules: null },
    operationalProfile: null,
    enabledModules: {
      features: {
        menu: true,
        orders: true,
        salon: false,
        tables: false,
        delivery: false,
        reservations: false,
        onlineOrdering: true,
        takeaway: true,
      },
    },
    subscriptionPlan: {
      planId: 'STARTER',
      planType: 'STARTER',
      isActive: true,
      features: { analytics: false, delivery: false, multi_location: false },
      limits: {},
    },
    tenantConfig: {
      isPublished: false,
      branchCount: 0,
      isFranchise: false,
      onboardingIncomplete: true,
    },
    runtimeContext: {
      role: 'OWNER',
      operatorMaturity: 'new',
      goLiveProgress: 10,
      goLiveIsReady: false,
      demoMode: false,
      ordersCount: 0,
      accountAgeDays: 1,
    },
    experienceProfileOverride: null,
  });

  it('returns override when set', () => {
    const input = {
      ...baseInput(),
      experienceProfileOverride: 'full-service' as const,
    };
    const trace = resolveProfileId(input);
    expect(trace.profileId).toBe('full-service');
    expect(trace.source).toBe('override');
  });

  it('infers delivery-first when delivery enabled', () => {
    const input = baseInput();
    input.enabledModules.features.delivery = true;
    input.operationalProfile = {
      id: 'p1',
      restaurantId: 'r1',
      schemaVersion: 1,
      operationalModel: 'digital',
      maturityLevel: 'basic',
      focusAreas: ['delivery_logistics'],
      businessPriorities: { primary: 'speed' },
      capabilitySnapshot: null,
      profileStatus: 'completed',
      completedWizardVersion: 1,
      completedStepIds: [],
      completedAt: null,
      completedByUserId: null,
      migratedFromLegacy: false,
      migrationSource: null,
      dismissedHints: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const trace = resolveProfileId(input);
    expect(trace.profileId).toBe('delivery-first');
    expect(trace.source).toBe('inferred');
  });

  it('infers multi-branch when plan and branches match', () => {
    const input = baseInput();
    input.subscriptionPlan.features.multi_location = true;
    input.tenantConfig.branchCount = 3;
    input.enabledModules.features.salon = true;
    input.enabledModules.features.tables = true;
    const trace = resolveProfileId(input);
    expect(trace.profileId).toBe('multi-branch');
  });
});
