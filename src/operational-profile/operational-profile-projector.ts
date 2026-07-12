import {
  featuresForOperationalModel,
  mergeFocusAreasWithFeatures,
} from './operational-profile-features';
import type {
  BusinessPriority,
  DashboardProjection,
  EmptyStateProjection,
  FocusArea,
  GoLiveProjection,
  GuidedExperienceProjection,
  IntelligencePolicy,
  NavigationProjection,
  OperationalModel,
  OperationalProfileProjections,
  OperationalProfileRecord,
} from './operational-profile.types';

export interface ProjectorContext {
  role?: string;
  planType?: string;
  operatorMaturity?: 'new' | 'veteran';
  features?: Record<string, boolean> | null;
}

const NAV_GROUP_DIGITAL = ['ventas', 'operacion', 'negocio', 'config'];
const NAV_GROUP_SALON = ['operacion', 'negocio', 'ventas', 'config'];
const NAV_GROUP_MIXED = ['operacion', 'ventas', 'negocio', 'config'];

const DIGITAL_DEFERRED_GROUPS: string[] = [];
const SALON_DEFERRED_GROUPS = ['ventas'];

const DIGITAL_SUPPRESSED_WIDGETS = [
  'first-shift-assistant',
  'floor-map-teaser',
];
const SALON_SUPPRESSED_WIDGETS = ['delivery-teaser', 'web-publish-push'];

const DIGITAL_GO_LIVE_PRIORITY = [
  'menu',
  'payments',
  'publish',
  'test-order',
  'branding-contrast',
];
const SALON_GO_LIVE_PRIORITY = [
  'salon-desktop',
  'salon-sync',
  'salon-cobro',
  'daily-operation-opening',
  'menu',
  'fiscal-arca',
];
const MIXED_GO_LIVE_PRIORITY = [
  'menu',
  'salon-desktop',
  'payments',
  'publish',
  'salon-cobro',
  'test-order',
];

const DIGITAL_SUPPRESSED_SLICES = ['table-idle', 'reservation-no-show'];
const SALON_SUPPRESSED_SLICES = ['marketplace-commission', 'web-traffic-drop'];

export function projectOperationalProfile(
  profile: OperationalProfileRecord,
  context: ProjectorContext = {},
): OperationalProfileProjections {
  const features =
    context.features ?? profile.capabilitySnapshot?.featuresAtCompletion ?? {};
  const focusAreas = mergeFocusAreasWithFeatures(profile.focusAreas, features);
  const priority = profile.businessPriorities?.primary ?? 'reliability';

  return {
    navigation: projectNavigation(profile.operationalModel, focusAreas),
    dashboard: projectDashboard(profile, focusAreas, priority, context),
    intelligence: projectIntelligence(profile, context),
    goLive: projectGoLive(profile.operationalModel, focusAreas),
    emptyStates: projectEmptyStates(profile.operationalModel),
    guidedExperience: projectGuidedExperience(profile),
  };
}

function projectNavigation(
  model: OperationalModel,
  focusAreas: FocusArea[],
): NavigationProjection {
  const baseOrder =
    model === 'digital'
      ? NAV_GROUP_DIGITAL
      : model === 'salon'
        ? NAV_GROUP_SALON
        : reorderMixedNav(focusAreas);

  const deprioritized =
    model === 'digital'
      ? SALON_DEFERRED_GROUPS
      : model === 'salon'
        ? DIGITAL_DEFERRED_GROUPS
        : [];

  return {
    primaryNavGroupOrder: baseOrder,
    deprioritizedNavGroupIds: deprioritized,
    exploreBadgeGroupIds: deprioritized,
  };
}

function reorderMixedNav(focusAreas: FocusArea[]): string[] {
  const prefersDigital =
    focusAreas.includes('web_channel') ||
    focusAreas.includes('delivery_logistics');
  return prefersDigital
    ? ['ventas', 'operacion', 'negocio', 'config']
    : NAV_GROUP_MIXED;
}

function projectDashboard(
  profile: OperationalProfileRecord,
  focusAreas: FocusArea[],
  priority: BusinessPriority,
  context: ProjectorContext,
): DashboardProjection {
  const hero = focusAreas[0] ?? 'order_fulfillment';
  const suppressed =
    profile.operationalModel === 'digital'
      ? DIGITAL_SUPPRESSED_WIDGETS
      : profile.operationalModel === 'salon'
        ? SALON_SUPPRESSED_WIDGETS
        : [];

  if (context.operatorMaturity === 'veteran') {
    suppressed.push('setup-assistant', 'go-live-badge');
  }

  return {
    heroWidget: hero,
    suppressedWidgetIds: suppressed,
    quickActionFocusAreas: focusAreas.slice(0, 3),
    kpiPriority: priority,
  };
}

function projectIntelligence(
  profile: OperationalProfileRecord,
  context: ProjectorContext,
): IntelligencePolicy {
  const baseWeights: Record<string, number> = {
    'order-delayed': 1,
    'kitchen-congestion': 1,
    'revenue-drop': 1,
    'delivery-sla': 1,
    'table-turn': 1,
    'cash-open': 1,
  };

  const priority = profile.businessPriorities?.primary ?? 'reliability';

  if (priority === 'speed') {
    baseWeights['order-delayed'] = 1.8;
    baseWeights['kitchen-congestion'] = 1.6;
    baseWeights['delivery-sla'] = 1.5;
  } else if (priority === 'sales_growth') {
    baseWeights['revenue-drop'] = 1.8;
    baseWeights['channel-mix'] = 1.6;
  } else if (priority === 'salon_experience') {
    baseWeights['table-turn'] = 1.7;
    baseWeights['reservation-upcoming'] = 1.4;
  } else if (priority === 'reliability') {
    baseWeights['cash-open'] = 1.6;
    baseWeights['kitchen-congestion'] = 1.5;
  }

  if (profile.operationalModel === 'digital') {
    baseWeights['delivery-sla'] = (baseWeights['delivery-sla'] ?? 1) * 1.3;
    baseWeights['channel-mix'] = (baseWeights['channel-mix'] ?? 1) * 1.2;
  } else if (profile.operationalModel === 'salon') {
    baseWeights['table-turn'] = (baseWeights['table-turn'] ?? 1) * 1.3;
    baseWeights['cash-open'] = (baseWeights['cash-open'] ?? 1) * 1.2;
  }

  const suppressed =
    profile.operationalModel === 'digital'
      ? DIGITAL_SUPPRESSED_SLICES
      : profile.operationalModel === 'salon'
        ? SALON_SUPPRESSED_SLICES
        : [];

  const alertBudget =
    profile.maturityLevel === 'basic'
      ? 3
      : profile.maturityLevel === 'intermediate'
        ? 5
        : 7;

  const briefingCadence =
    context.operatorMaturity === 'veteran'
      ? 'weekly'
      : profile.profileStatus === 'completed'
        ? 'service'
        : 'setup';

  return {
    sliceWeights: baseWeights,
    suppressedSlices: suppressed,
    baselineProfile: profile.operationalModel,
    briefingCadence,
    priorityLens: priority,
    alertBudget,
  };
}

function projectGoLive(
  model: OperationalModel,
  focusAreas: FocusArea[],
): GoLiveProjection {
  let prioritized =
    model === 'digital'
      ? DIGITAL_GO_LIVE_PRIORITY
      : model === 'salon'
        ? SALON_GO_LIVE_PRIORITY
        : MIXED_GO_LIVE_PRIORITY;

  if (focusAreas.includes('delivery_logistics')) {
    prioritized = [
      ...prioritized,
      'delivery-zone',
      'delivery-driver',
      'delivery-test',
    ];
  }

  const deferred =
    model === 'digital'
      ? ['salon-desktop', 'salon-sync', 'daily-operation-opening']
      : model === 'salon'
        ? ['publish', 'directory-listing', 'test-order']
        : [];

  return { prioritizedStepIds: prioritized, deferredStepIds: deferred };
}

function projectEmptyStates(model: OperationalModel): EmptyStateProjection {
  if (model === 'digital') {
    return {
      copyBySurface: {
        delivery:
          'Cuando actives delivery, vas a ver rutas y repartidores acá.',
        salon: 'Si operás con mesas, activá salón en Ajustes > Módulos.',
        analytics: 'Con más pedidos, vas a ver tendencias de ventas acá.',
      },
    };
  }

  if (model === 'salon') {
    return {
      copyBySurface: {
        delivery:
          'Delivery disponible en Ajustes > Módulos cuando lo necesites.',
        salon: 'Configurá tu mapa de salón para empezar a operar mesas.',
        analytics:
          'Con más turnos cerrados, vas a ver el resumen del negocio acá.',
      },
    };
  }

  return {
    copyBySurface: {
      delivery: 'Activá delivery cuando quieras sumar envíos a tu operación.',
      salon: 'Tu mapa de salón y pedidos digitales conviven acá.',
      analytics: 'Con más actividad, vas a ver cómo rinde cada canal.',
    },
  };
}

function projectGuidedExperience(
  profile: OperationalProfileRecord,
): GuidedExperienceProjection {
  return {
    enabled:
      profile.maturityLevel === 'basic' &&
      profile.profileStatus === 'completed',
    path: profile.operationalModel,
    maxHints: profile.maturityLevel === 'basic' ? 3 : 0,
  };
}

export function defaultFocusAreasForModel(
  model: OperationalModel,
): FocusArea[] {
  switch (model) {
    case 'digital':
      return ['order_fulfillment', 'web_channel'];
    case 'salon':
      return ['floor_service', 'cash_control'];
    case 'mixed':
    default:
      return ['floor_service', 'order_fulfillment'];
  }
}

export function focusAreaOptionsForModel(model: OperationalModel): FocusArea[] {
  switch (model) {
    case 'digital':
      return [
        'order_fulfillment',
        'delivery_logistics',
        'web_channel',
        'revenue_growth',
      ];
    case 'salon':
      return [
        'floor_service',
        'reservations',
        'cash_control',
        'order_fulfillment',
        'revenue_growth',
      ];
    case 'mixed':
    default:
      return [
        'floor_service',
        'order_fulfillment',
        'web_channel',
        'delivery_logistics',
        'reservations',
        'cash_control',
        'revenue_growth',
      ];
  }
}

export function startFocusOptionsForModel(
  model: OperationalModel,
): FocusArea[] {
  switch (model) {
    case 'digital':
      return ['order_fulfillment', 'delivery_logistics', 'web_channel'];
    case 'salon':
      return ['floor_service', 'cash_control', 'reservations'];
    case 'mixed':
    default:
      return ['floor_service', 'order_fulfillment', 'web_channel'];
  }
}

export { featuresForOperationalModel };
