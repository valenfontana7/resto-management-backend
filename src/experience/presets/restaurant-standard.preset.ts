import type { ExperiencePreset } from '../experience.types';
import {
  BASE_COPILOT,
  BASE_QUICK_ACTIONS,
  DEFAULT_LAYOUT_BY_MOMENT,
  baseNavigation,
} from './preset-shared';

export const restaurantStandardPreset: ExperiencePreset = {
  id: 'restaurant-standard',
  label: 'Mostrador y retiro',
  description:
    'Mostrador, retiro y pedidos en mostrador, sin mapa de mesas ni servicio de salón completo.',
  match: {
    operationalModels: ['mixed'],
    requiredFeatures: { takeaway: true },
    weight: 8,
  },
  navigation: baseNavigation({
    homePath: '/admin/turno',
    groupOrder: ['operacion', 'ventas', 'negocio', 'config'],
    itemHrefsByGroup: {
      operacion: [
        '/admin/turno',
        '/admin/turno?lens=caja',
        '/kitchen',
        '/admin/turno?lens=encargado',
      ],
      negocio: ['/admin/analytics', '/admin/diario', '/admin/negocio'],
      ventas: [
        '/admin/menu',
        '/admin/builder',
        '/admin/promotions',
        '/admin/reviews',
        '/admin/loyalty',
      ],
      config: ['/admin/go-live', '/admin/settings', '/admin/subscription'],
    },
    mobileBottomNav: [
      '/admin/turno',
      '/admin/turno?lens=caja',
      '/admin/menu',
      '/admin',
    ],
  }),
  dashboard: {
    defaultRoute: '/admin/turno',
    widgets: [
      { id: 'today-summary', order: 1, moment: 'all' },
      { id: 'quick-actions', order: 2, moment: 'all' },
      { id: 'attention-panel', order: 3, moment: 'active' },
      { id: 'turn-pulse', order: 4, moment: 'active' },
      { id: 'setup-assistant', order: 5, moment: 'setup' },
    ],
    kpis: [
      { id: 'sales-today', order: 1 },
      { id: 'orders-pending', order: 2 },
    ],
    layoutByMoment: DEFAULT_LAYOUT_BY_MOMENT,
  },
  quickActions: BASE_QUICK_ACTIONS,
  copilot: {
    ...BASE_COPILOT,
    suppressedInsightPrefixes: ['table-idle', 'reservation-no-show'],
  },
  workspaces: [
    { id: 'turno', label: 'Turno', routes: ['/admin/turno'], visible: true },
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
      id: 'standard-onboarding',
      enabled: true,
      maxHints: 4,
      path: 'mixed',
      hintIds: ['menu', 'test-order', 'opening'],
    },
  ],
  emptyStates: {
    orders: {
      title: 'Sin pedidos en cola',
      description:
        'Cuando llegue el primer pedido del turno, lo vas a ver acá.',
      ctaHref: '/admin/menu',
      ctaLabel: 'Revisar menú',
    },
    salon: {
      title: 'Mostrador y retiro',
      description:
        'Este modo no usa mapa de mesas. Operá desde la cola de pedidos.',
    },
  },
  terminology: {
    ordersLabel: 'Pedido',
    salonLabel: 'Mostrador',
    dashboardTitle: 'Tu turno',
    turnLabel: 'Turno en vivo',
    branchLabel: 'Local',
  },
  workflows: [
    {
      id: 'daily-ops',
      label: 'Operación diaria',
      stepIds: ['opening', 'orders', 'closing'],
      priority: 1,
    },
  ],
  systemPriorities: [
    { id: 'order_fulfillment', weight: 1, label: 'Entrega de pedidos' },
    { id: 'speed', weight: 2, label: 'Velocidad de servicio' },
  ],
  suppressedWidgetIds: ['floor-map-teaser'],
};
