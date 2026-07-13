import type {
  ExperienceDashboardLayout,
  ExperiencePreset,
  PresetCopilotConfig,
  PresetNavigation,
  PresetQuickActionCatalog,
} from '../experience.types';

export const DEFAULT_LAYOUT_BY_MOMENT: Record<
  'setup' | 'active' | 'optimize',
  ExperienceDashboardLayout
> = {
  setup: {
    widgetOrder: [
      'setup-assistant',
      'go-live-badge',
      'today-summary',
      'quick-actions',
    ],
    kpiOrder: [],
    showQuickActions: true,
    showAttentionPanel: false,
    showBriefingHeader: false,
  },
  active: {
    widgetOrder: [
      'morning-briefing',
      'today-summary',
      'attention-panel',
      'quick-actions',
      'activity-feed',
      'turn-pulse',
    ],
    kpiOrder: ['sales-today', 'orders-pending', 'reservations-today'],
    showQuickActions: true,
    showAttentionPanel: true,
    showBriefingHeader: true,
  },
  optimize: {
    widgetOrder: [
      'business-health-teaser',
      'weekly-recap',
      'today-summary',
      'quick-actions',
      'activity-feed',
    ],
    kpiOrder: ['sales-today', 'margin-signal', 'retention-signal'],
    showQuickActions: true,
    showAttentionPanel: false,
    showBriefingHeader: true,
  },
};

export const BASE_COPILOT: PresetCopilotConfig = {
  specialistName: 'Tu turno',
  tagline: 'Pedidos, cocina y reservas — te digo qué mirar primero',
  surfaces: [
    'dashboard',
    'operacion',
    'salon',
    'orders',
    'reservations',
    'kitchen',
  ],
  entryPoints: [
    { surface: 'dashboard', placement: 'hero', priority: 1, enabled: true },
    { surface: 'dashboard', placement: 'dock', priority: 2, enabled: true },
    { surface: 'operacion', placement: 'panel', priority: 3, enabled: true },
  ],
  insightIdPrefixes: [
    'daily-operation:',
    'operational:',
    'segment:',
    'event:order',
    'event:reservation',
    'event:restaurant',
    'event:daily-closing',
    'event:delivery',
  ],
  suppressedInsightPrefixes: [],
  domainUrls: {
    inventoryUrl: '/admin/salud',
    cashClosingUrl: '/admin/caja',
    reviewsUrl: '/admin/reviews',
    growthUrl: '/admin/negocio',
    ordersUrl: '/admin/turno?lens=caja',
  },
};

export function baseNavigation(
  overrides: Partial<PresetNavigation>,
): PresetNavigation {
  return {
    homePath: '/admin',
    groupOrder: ['operacion', 'negocio', 'ventas', 'config'],
    deprioritizedGroupIds: [],
    exploreBadgeGroupIds: [],
    itemHrefsByGroup: {
      operacion: [
        '/admin/turno',
        '/admin/turno?lens=caja',
        '/admin/salon',
        '/kitchen',
        '/admin/delivery',
        '/admin/reservations',
        '/admin/tables',
        '/admin/turno?lens=encargado',
        '/admin/integrations',
        '/admin/comprobantes',
        '/admin/delivery/mis-envios',
      ],
      negocio: [
        '/admin/negocio',
        '/admin/negocio?tab=margenes',
        '/admin/negocio?tab=decisiones',
        '/admin/analytics',
        '/admin/experiments',
        '/admin/packs/customers',
        '/admin/packs/inventory',
        '/admin/caja-mayor',
        '/admin/diario',
      ],
      ventas: [
        '/admin/builder',
        '/admin/menu',
        '/admin/promotions',
        '/admin/reviews',
        '/admin/loyalty',
      ],
      config: ['/admin/go-live', '/admin/settings', '/admin/subscription'],
    },
    mobileBottomNav: ['/admin', '/admin/turno', '/admin/salon', '/admin/menu'],
    commandBarCommands: [
      { id: 'home', label: 'Hoy', href: '/admin', shortcut: 'G H' },
      {
        id: 'orders',
        label: 'Cola de pedidos',
        href: '/admin/turno?lens=caja',
      },
      { id: 'menu', label: 'Menú', href: '/admin/menu' },
      { id: 'settings', label: 'Ajustes', href: '/admin/settings' },
    ],
    ...overrides,
  };
}

export const BASE_QUICK_ACTIONS: PresetQuickActionCatalog = {
  setup: ['/admin/menu', '/admin/builder', '/admin/go-live', '/admin/settings'],
  active: [
    '/admin/turno?lens=caja',
    '/admin/salon',
    '/kitchen',
    '/admin/turno?lens=encargado',
  ],
  optimize: ['/admin/negocio', '/admin/analytics', '/admin/diario'],
};

export function mergePreset(
  base: ExperiencePreset,
  overrides: Partial<ExperiencePreset>,
): ExperiencePreset {
  return {
    ...base,
    ...overrides,
    navigation: { ...base.navigation, ...overrides.navigation },
    dashboard: { ...base.dashboard, ...overrides.dashboard },
    quickActions: { ...base.quickActions, ...overrides.quickActions },
    copilot: { ...base.copilot, ...overrides.copilot },
    terminology: { ...base.terminology, ...overrides.terminology },
    emptyStates: { ...base.emptyStates, ...overrides.emptyStates },
  };
}
