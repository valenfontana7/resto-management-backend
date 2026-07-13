import type { ExperiencePreset } from '../experience.types';
import { BASE_COPILOT, baseNavigation } from './preset-shared';

export const franchiseEnterprisePreset: ExperiencePreset = {
  id: 'franchise-enterprise',
  label: 'Franquicia o cadena',
  description:
    'Red de franquicia o cadena. Prioriza gobierno del negocio, cumplimiento y métricas de red.',
  match: {
    planFeatures: ['multi_location', 'api_access'],
    requiresFranchise: true,
    weight: 25,
  },
  extends: 'multi-branch',
  navigation: baseNavigation({
    homePath: '/admin/negocio',
    groupOrder: ['negocio', 'config', 'operacion', 'ventas'],
    deprioritizedGroupIds: ['ventas'],
    exploreBadgeGroupIds: ['ventas'],
    itemHrefsByGroup: {
      operacion: ['/admin/packs/operations', '/admin/turno', '/admin/salon'],
      negocio: [
        '/admin/negocio',
        '/admin/negocio?tab=margenes',
        '/admin/negocio?tab=decisiones',
        '/admin/analytics',
        '/admin/packs/customers',
        '/admin/packs/inventory',
        '/admin/diario',
        '/admin/experiments',
      ],
      ventas: ['/admin/menu', '/admin/promotions'],
      config: ['/admin/settings', '/admin/subscription', '/admin/integrations'],
    },
    mobileBottomNav: [
      '/admin/negocio',
      '/admin/analytics',
      '/admin',
      '/admin/settings',
    ],
  }),
  dashboard: {
    defaultRoute: '/admin/negocio',
    widgets: [
      { id: 'network-health', order: 1, moment: 'all' },
      { id: 'compliance-panel', order: 2, moment: 'all' },
      { id: 'business-health-teaser', order: 3, moment: 'all' },
      { id: 'weekly-recap', order: 4, moment: 'optimize' },
      { id: 'branch-switcher', order: 5, moment: 'all' },
    ],
    kpis: [
      { id: 'network-revenue', order: 1 },
      { id: 'compliance-score', order: 2 },
      { id: 'unit-performance', order: 3 },
    ],
    layoutByMoment: {
      setup: {
        widgetOrder: ['compliance-panel', 'network-health', 'quick-actions'],
        kpiOrder: [],
        showQuickActions: true,
        showAttentionPanel: false,
        showBriefingHeader: false,
      },
      active: {
        widgetOrder: [
          'network-health',
          'compliance-panel',
          'business-health-teaser',
          'quick-actions',
        ],
        kpiOrder: ['network-revenue', 'compliance-score', 'unit-performance'],
        showQuickActions: true,
        showAttentionPanel: true,
        showBriefingHeader: true,
      },
      optimize: {
        widgetOrder: [
          'weekly-recap',
          'network-health',
          'business-health-teaser',
        ],
        kpiOrder: ['network-revenue', 'margin-signal', 'unit-performance'],
        showQuickActions: true,
        showAttentionPanel: false,
        showBriefingHeader: true,
      },
    },
  },
  quickActions: {
    setup: ['/admin/settings', '/admin/negocio', '/admin/subscription'],
    active: [
      '/admin/negocio',
      '/admin/analytics',
      '/admin/packs/operations',
      '/admin/diario',
    ],
    optimize: [
      '/admin/negocio?tab=decisiones',
      '/admin/experiments',
      '/admin/packs/customers',
    ],
  },
  copilot: {
    ...BASE_COPILOT,
    specialistName: 'Tu red',
    tagline: 'Tu red de locales — te digo dónde conviene actuar primero',
    surfaces: ['executive', 'analytics', 'dashboard'],
    suppressedInsightPrefixes: ['event:order'],
    entryPoints: [
      { surface: 'executive', placement: 'hero', priority: 1, enabled: true },
      { surface: 'dashboard', placement: 'panel', priority: 2, enabled: true },
    ],
    domainUrls: {
      inventoryUrl: '/admin/packs/inventory',
      cashClosingUrl: '/admin/caja-mayor',
      reviewsUrl: '/admin/reviews',
      growthUrl: '/admin/negocio?tab=decisiones',
      ordersUrl: '/admin/packs/operations',
    },
  },
  workspaces: [
    {
      id: 'governance',
      label: 'Gobierno del negocio',
      routes: ['/admin/negocio'],
      visible: true,
    },
    {
      id: 'compliance',
      label: 'Cumplimiento',
      routes: ['/admin/settings'],
      visible: true,
    },
    {
      id: 'operations',
      label: 'Operaciones',
      routes: ['/admin/packs/operations'],
      visible: true,
    },
  ],
  tutorials: [
    {
      id: 'franchise-tour',
      enabled: true,
      maxHints: 4,
      hintIds: ['network-overview', 'compliance', 'unit-compare'],
    },
  ],
  emptyStates: {
    network: {
      title: 'Red en configuración',
      description:
        'Completá la configuración de unidades y permisos de franquicia.',
      ctaHref: '/admin/settings',
      ctaLabel: 'Configurar red',
    },
  },
  terminology: {
    ordersLabel: 'Transacción',
    salonLabel: 'Unidad',
    dashboardTitle: 'Salud de la red',
    turnLabel: 'Operación',
    branchLabel: 'Unidad',
  },
  workflows: [
    {
      id: 'franchise-governance',
      label: 'Gobierno de la red',
      stepIds: ['network-review', 'compliance', 'unit-audit'],
      priority: 1,
    },
  ],
  systemPriorities: [
    { id: 'margin', weight: 1, label: 'Margen de la red' },
    { id: 'reliability', weight: 2, label: 'Cumplimiento operativo' },
    { id: 'revenue_growth', weight: 3, label: 'Crecimiento de unidades' },
  ],
};
