import type { ExperiencePreset } from '../experience.types';
import {
  BASE_COPILOT,
  DEFAULT_LAYOUT_BY_MOMENT,
  baseNavigation,
} from './preset-shared';

export const deliveryFirstPreset: ExperiencePreset = {
  id: 'delivery-first',
  label: 'Envíos primero',
  description:
    'Tu negocio gira en torno a los envíos. La cola de reparto y la logística van al centro.',
  match: {
    requiredFeatures: { delivery: true },
    focusAreas: ['delivery_logistics'],
    weight: 15,
  },
  navigation: baseNavigation({
    homePath: '/admin/delivery',
    groupOrder: ['operacion', 'ventas', 'negocio', 'config'],
    itemHrefsByGroup: {
      operacion: [
        '/admin/delivery',
        '/admin/delivery/mis-envios',
        '/admin/turno?lens=caja',
        '/admin/integrations',
        '/kitchen',
      ],
      negocio: ['/admin/analytics', '/admin/diario', '/admin/negocio'],
      ventas: ['/admin/menu', '/admin/builder', '/admin/promotions'],
      config: ['/admin/go-live', '/admin/settings', '/admin/subscription'],
    },
    mobileBottomNav: [
      '/admin/delivery',
      '/admin/turno?lens=caja',
      '/admin/menu',
      '/admin',
    ],
  }),
  dashboard: {
    defaultRoute: '/admin/delivery',
    widgets: [
      { id: 'delivery-teaser', order: 1, moment: 'all' },
      { id: 'today-summary', order: 2, moment: 'all' },
      { id: 'quick-actions', order: 3, moment: 'all' },
      { id: 'attention-panel', order: 4, moment: 'active' },
      { id: 'activity-feed', order: 5, moment: 'active' },
    ],
    kpis: [
      { id: 'deliveries-today', order: 1 },
      { id: 'orders-pending', order: 2 },
      { id: 'avg-delivery-time', order: 3 },
    ],
    layoutByMoment: {
      ...DEFAULT_LAYOUT_BY_MOMENT,
      active: {
        ...DEFAULT_LAYOUT_BY_MOMENT.active,
        widgetOrder: [
          'delivery-teaser',
          'today-summary',
          'quick-actions',
          'attention-panel',
        ],
      },
    },
  },
  quickActions: {
    setup: [
      '/admin/menu',
      '/admin/delivery',
      '/admin/go-live',
      '/admin/settings',
    ],
    active: [
      '/admin/delivery',
      '/admin/turno?lens=caja',
      '/admin/delivery/mis-envios',
      '/kitchen',
    ],
    optimize: ['/admin/analytics', '/admin/negocio', '/admin/diario'],
  },
  copilot: {
    ...BASE_COPILOT,
    tagline: 'Tus envíos — te digo qué salida priorizar',
    surfaces: ['dashboard', 'delivery', 'orders', 'kitchen'],
    suppressedInsightPrefixes: ['table-idle', 'reservation-', 'floor-'],
    entryPoints: [
      { surface: 'dashboard', placement: 'hero', priority: 1, enabled: true },
      { surface: 'delivery', placement: 'panel', priority: 1, enabled: true },
      { surface: 'dashboard', placement: 'dock', priority: 2, enabled: true },
    ],
  },
  workspaces: [
    {
      id: 'delivery',
      label: 'Envíos',
      routes: ['/admin/delivery', '/admin/delivery/mis-envios'],
      visible: true,
    },
    {
      id: 'orders',
      label: 'Cola',
      routes: ['/admin/turno?lens=caja'],
      visible: true,
    },
    { id: 'dashboard', label: 'Hoy', routes: ['/admin'], visible: true },
  ],
  tutorials: [
    {
      id: 'delivery-onboarding',
      enabled: true,
      maxHints: 4,
      hintIds: ['delivery-zones', 'test-delivery', 'integrations'],
    },
  ],
  emptyStates: {
    delivery: {
      title: 'Sin envíos activos',
      description: 'Configurá zonas de envío y activá el módulo en Ajustes.',
      ctaHref: '/admin/settings',
      ctaLabel: 'Configurar envíos',
    },
    salon: {
      title: 'Salón en segundo plano',
      description: 'Tu operación prioriza los envíos. El salón queda aparte.',
    },
  },
  terminology: {
    ordersLabel: 'Pedido a domicilio',
    salonLabel: 'Retiro en el local',
    dashboardTitle: 'Centro de envíos',
    turnLabel: 'Cola de envíos',
    branchLabel: 'Local',
  },
  workflows: [
    {
      id: 'delivery-ops',
      label: 'Operación de envíos',
      stepIds: ['delivery-zones', 'drivers', 'integrations'],
      priority: 1,
    },
  ],
  systemPriorities: [
    { id: 'delivery_logistics', weight: 1, label: 'Logística de envíos' },
    { id: 'order_fulfillment', weight: 2, label: 'Entrega de pedidos' },
  ],
  suppressedWidgetIds: ['floor-map-teaser', 'web-publish-push'],
};
