import {
  getRestaurantProductIntent,
  type OnboardingProductIntent,
} from '../restaurants/onboarding-product-intent';
import type {
  BusinessPriorities,
  FocusArea,
  MaturityLevel,
  OperationalModel,
  OperationalProfileRecord,
} from './operational-profile.types';
import { defaultFocusAreasForModel } from './operational-profile-projector';
import { featuresForOperationalModel } from './operational-profile-features';

export type MigrationSource = 'productIntent' | 'usage_inference' | 'manual';

export interface LegacyRestaurantSnapshot {
  id: string;
  businessRules: unknown;
  features: unknown;
  onboardingIncomplete: boolean;
  createdAt: Date;
  _count?: {
    orders?: number;
    tableSessions?: number;
  };
}

export function mapProductIntentToModel(
  intent: OnboardingProductIntent,
): OperationalModel {
  switch (intent) {
    case 'digital':
      return 'digital';
    case 'operations':
      return 'salon';
    case 'both':
    default:
      return 'mixed';
  }
}

export function inferFocusAreasFromFeatures(
  features: Record<string, boolean>,
  model: OperationalModel,
): FocusArea[] {
  const areas: FocusArea[] = [];

  if (features.delivery) areas.push('delivery_logistics');
  if (features.onlineOrdering || features.takeaway) areas.push('web_channel');
  if (features.salon || features.tables) areas.push('floor_service');
  if (features.reservations) areas.push('reservations');
  if (features.orders) areas.push('order_fulfillment');

  if (areas.length === 0) {
    return defaultFocusAreasForModel(model);
  }

  return [...new Set(areas)];
}

export function inferMaturityLevel(
  snapshot: LegacyRestaurantSnapshot,
): MaturityLevel {
  const orderCount = snapshot._count?.orders ?? 0;
  const ageDays =
    (Date.now() - snapshot.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  if (!snapshot.onboardingIncomplete && orderCount >= 5) {
    return ageDays >= 30 ? 'advanced' : 'intermediate';
  }

  if (orderCount >= 1) {
    return 'intermediate';
  }

  return 'basic';
}

export function inferBusinessPriorities(
  model: OperationalModel,
  focusAreas: FocusArea[],
): BusinessPriorities {
  if (focusAreas.includes('delivery_logistics') || model === 'digital') {
    return { primary: 'speed', secondary: 'sales_growth' };
  }
  if (model === 'salon' || focusAreas.includes('floor_service')) {
    return { primary: 'salon_experience', secondary: 'team_coordination' };
  }
  return { primary: 'reliability', secondary: 'sales_growth' };
}

export function inferProfileFromLegacy(
  snapshot: LegacyRestaurantSnapshot,
  source: MigrationSource = 'productIntent',
): Omit<
  OperationalProfileRecord,
  'id' | 'restaurantId' | 'createdAt' | 'updatedAt' | 'dismissedHints'
> {
  const intent = getRestaurantProductIntent(snapshot.businessRules);
  const model = mapProductIntentToModel(intent);
  const features = (snapshot.features ?? {}) as Record<string, boolean>;
  const focusAreas = inferFocusAreasFromFeatures(features, model);
  const maturityLevel = inferMaturityLevel(snapshot);
  const businessPriorities = inferBusinessPriorities(model, focusAreas);

  return {
    schemaVersion: 1,
    operationalModel: model,
    maturityLevel,
    focusAreas,
    businessPriorities,
    capabilitySnapshot: {
      featuresAtCompletion: featuresForOperationalModel(model, focusAreas),
      channelsDeclared: [],
    },
    profileStatus: 'completed',
    completedWizardVersion: 1,
    completedStepIds: ['v1:model', 'v1:start', 'v1:needs', 'v1:priorities'],
    completedAt: new Date(),
    completedByUserId: null,
    migratedFromLegacy: true,
    migrationSource: source,
  };
}

/**
 * Matriz de casos edge documentada para migración y soporte.
 */
export const MIGRATION_EDGE_CASES = {
  missingProductIntent: {
    input: { businessRules: null },
    expected: { operationalModel: 'mixed', migrationSource: 'productIntent' },
  },
  operationsWithoutSalonSessions: {
    input: { productIntent: 'operations', features: { salon: false } },
    expected: { focusAreas: ['order_fulfillment', 'cash_control'] },
  },
  digitalWithDeliveryEnabled: {
    input: { productIntent: 'digital', features: { delivery: true } },
    expected: { focusAreasIncludes: 'delivery_logistics' },
  },
  onboardingIncompleteButMature: {
    input: { onboardingIncomplete: true, orderCount: 10 },
    expected: { profileStatus: 'completed', maturityLevel: 'intermediate' },
  },
} as const;
