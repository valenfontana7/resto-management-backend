import type { ExperiencePreset } from '../experience.types';
import {
  BASE_COPILOT,
  DEFAULT_LAYOUT_BY_MOMENT,
  baseNavigation,
} from './preset-shared';

export const digitalOnlyPreset: ExperiencePreset = {
  id: 'digital-only',
  label: 'Solo ventas online',
  description:
    'Vendés por web y apps. Bentoo prioriza publicar tu sitio, el menú y los pedidos online.',
  match: {
    operationalModels: ['digital'],
    requiredFeatures: { salon: false, tables: false },
    weight: 10,
  },
  navigation: baseNavigation({
    homePath: '/admin',
    groupOrder: ['ventas', 'operacion', 'negocio', 'config'],
    deprioritizedGroupIds: ['operacion'],
    exploreBadgeGroupIds: ['operacion'],
    mobileBottomNav: [
      '/admin',
      '/admin/builder',
      '/admin/menu',
      '/admin/turno?lens=caja',
    ],
    itemHrefsByGroup: {
      operacion: ['/admin/turno?lens=caja', '/kitchen'],
      negocio: ['/admin/analytics', '/admin/diario', '/admin/negocio'],
      ventas: [
        '/admin/builder',
        '/admin/menu',
        '/admin/promotions',
        '/admin/reviews',
        '/admin/loyalty',
      ],
      config: ['/admin/go-live', '/admin/settings', '/admin/subscription'],
    },
  }),
  dashboard: {
    defaultRoute: '/admin',
    widgets: [
      { id: 'web-publish-push', order: 1, moment: 'setup' },
      { id: 'setup-assistant', order: 2, moment: 'setup' },
      { id: 'today-summary', order: 3, moment: 'all' },
      { id: 'quick-actions', order: 4, moment: 'all' },
      { id: 'morning-briefing', order: 5, moment: 'active' },
      { id: 'activity-feed', order: 6, moment: 'active' },
    ],
    kpis: [
      { id: 'orders-online-today', order: 1 },
      { id: 'web-visits', order: 2 },
    ],
    layoutByMoment: DEFAULT_LAYOUT_BY_MOMENT,
  },
  quickActions: {
    setup: [
      '/admin/menu',
      '/admin/builder',
      '/admin/go-live',
      '/admin/settings',
    ],
    active: ['/admin/builder', '/admin/turno?lens=caja', '/admin/menu'],
    optimize: ['/admin/analytics', '/admin/negocio', '/admin/diario'],
  },
  copilot: {
    ...BASE_COPILOT,
    tagline:
      'Tu canal digital — te digo qué publicar y qué pedido mirar primero',
    surfaces: ['dashboard', 'orders', 'builder'],
    suppressedInsightPrefixes: ['table-idle', 'reservation-no-show', 'floor-'],
    entryPoints: [
      { surface: 'dashboard', placement: 'hero', priority: 1, enabled: true },
      { surface: 'dashboard', placement: 'dock', priority: 2, enabled: true },
    ],
  },
  workspaces: [
    { id: 'dashboard', label: 'Hoy', routes: ['/admin'], visible: true },
    {
      id: 'web-channel',
      label: 'Canal web',
      routes: ['/admin/builder', '/admin/menu'],
      visible: true,
    },
    {
      id: 'orders',
      label: 'Pedidos online',
      routes: ['/admin/turno?lens=caja'],
      visible: true,
    },
  ],
  tutorials: [
    {
      id: 'digital-onboarding',
      enabled: true,
      maxHints: 5,
      path: 'digital',
      hintIds: ['publish-site', 'test-order', 'payments'],
    },
  ],
  emptyStates: {
    orders: {
      title: 'Sin pedidos online todavía',
      description:
        'Publicá tu sitio y compartí el link para recibir el primero.',
      ctaHref: '/admin/builder',
      ctaLabel: 'Publicar sitio',
    },
    salon: {
      title: 'Salón no activo',
      description:
        'Este modo está pensado para venta digital, no para salón presencial.',
    },
  },
  terminology: {
    ordersLabel: 'Pedido online',
    salonLabel: 'Salón',
    dashboardTitle: 'Tu canal digital',
    turnLabel: 'Cola web',
    branchLabel: 'Local',
  },
  workflows: [
    {
      id: 'go-live-digital',
      label: 'Arrancar online',
      stepIds: ['menu', 'payments', 'publish', 'test-order'],
      priority: 1,
    },
  ],
  systemPriorities: [
    { id: 'web_channel', weight: 1, label: 'Canal web' },
    { id: 'order_fulfillment', weight: 2, label: 'Entrega de pedidos' },
  ],
  suppressedWidgetIds: [
    'first-shift-assistant',
    'floor-map-teaser',
    'delivery-teaser',
  ],
};
