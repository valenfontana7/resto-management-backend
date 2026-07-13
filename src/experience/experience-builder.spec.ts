import { buildExperienceDefinition } from './experience-builder';
import type { ExperienceBuilderInput } from './experience.types';

describe('buildExperienceDefinition', () => {
  const baseInput = (): ExperienceBuilderInput => ({
    restaurantId: 'r1',
    capabilities: { features: {}, businessRules: null },
    operationalProfile: {
      id: 'p1',
      restaurantId: 'r1',
      schemaVersion: 1,
      operationalModel: 'salon',
      maturityLevel: 'basic',
      focusAreas: ['floor_service'],
      businessPriorities: { primary: 'salon_experience' },
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
    },
    enabledModules: {
      features: {
        menu: true,
        orders: true,
        salon: true,
        tables: true,
        delivery: false,
        reservations: true,
        onlineOrdering: false,
        takeaway: false,
      },
    },
    subscriptionPlan: {
      planId: 'PROFESSIONAL',
      planType: 'PROFESSIONAL',
      isActive: true,
      features: {
        analytics: true,
        delivery: true,
        reservations: true,
        kitchen_display: true,
        multi_location: false,
      },
      limits: {},
    },
    tenantConfig: {
      isPublished: true,
      branchCount: 0,
      isFranchise: false,
      onboardingIncomplete: false,
    },
    runtimeContext: {
      role: 'OWNER',
      operatorMaturity: 'new',
      goLiveProgress: 90,
      goLiveIsReady: true,
      demoMode: false,
      ordersCount: 5,
      accountAgeDays: 10,
    },
    experienceProfileOverride: null,
  });

  it('builds a valid definition for full-service salon', () => {
    const def = buildExperienceDefinition(baseInput());
    expect(def.schemaVersion).toBe(1);
    expect(def.profileId).toBe('full-service');
    expect(def.navigation.groups.length).toBeGreaterThan(0);
    expect(def.quickActions.length).toBeGreaterThan(0);
    expect(def.copilot.enabled).toBe(true);
    expect(def.modules.salon).toBe('available');
  });

  it('hides salon module when feature disabled', () => {
    const input = baseInput();
    input.enabledModules.features.salon = false;
    input.enabledModules.features.tables = false;
    const def = buildExperienceDefinition(input);
    expect(def.modules.salon).toBe('hidden');
  });
});
