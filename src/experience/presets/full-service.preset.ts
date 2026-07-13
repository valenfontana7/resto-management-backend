import type { ExperiencePreset } from '../experience.types';
import {
  BASE_COPILOT,
  DEFAULT_LAYOUT_BY_MOMENT,
  baseNavigation,
} from './preset-shared';

export const fullServicePreset: ExperiencePreset = {
  id: 'full-service',
  label: 'Salón completo',
  description:
    'Salón, mesas, reservas y coordinación del equipo durante el turno.',
  match: {
    operationalModels: ['salon', 'mixed'],
    requiredFeatures: { salon: true },
    weight: 12,
  },
  navigation: baseNavigation({
    homePath: '/admin/salon',
    groupOrder: ['operacion', 'negocio', 'ventas', 'config'],
    itemHrefsByGroup: {
      operacion: [
        '/admin/salon',
        '/admin/turno',
        '/admin/turno?lens=caja',
        '/kitchen',
        '/admin/reservations',
        '/admin/tables',
        '/admin/turno?lens=encargado',
        '/admin/comprobantes',
        '/admin/delivery',
      ],
      negocio: [
        '/admin/negocio',
        '/admin/analytics',
        '/admin/caja-mayor',
        '/admin/diario',
        '/admin/packs/customers',
      ],
      ventas: [
        '/admin/menu',
        '/admin/promotions',
        '/admin/reviews',
        '/admin/loyalty',
      ],
      config: ['/admin/go-live', '/admin/settings', '/admin/subscription'],
    },
    mobileBottomNav: ['/admin/salon', '/admin/turno', '/kitchen', '/admin'],
  }),
  dashboard: {
    defaultRoute: '/admin/salon',
    widgets: [
      { id: 'turn-pulse', order: 1, moment: 'active' },
      { id: 'first-shift-assistant', order: 2, moment: 'setup' },
      { id: 'today-summary', order: 3, moment: 'all' },
      { id: 'quick-actions', order: 4, moment: 'all' },
      { id: 'attention-panel', order: 5, moment: 'active' },
      { id: 'floor-map-teaser', order: 6, moment: 'active' },
    ],
    kpis: [
      { id: 'sales-today', order: 1 },
      { id: 'tables-occupied', order: 2 },
      { id: 'reservations-today', order: 3 },
    ],
    layoutByMoment: DEFAULT_LAYOUT_BY_MOMENT,
  },
  quickActions: {
    setup: ['/admin/salon', '/admin/menu', '/admin/go-live', '/admin/settings'],
    active: [
      '/admin/salon',
      '/admin/turno?lens=caja',
      '/kitchen',
      '/admin/reservations',
    ],
    optimize: ['/admin/negocio', '/admin/analytics', '/admin/caja-mayor'],
  },
  copilot: {
    ...BASE_COPILOT,
    tagline: 'Tu salón — te digo qué mesa, pedido o reserva mirar primero',
    surfaces: ['dashboard', 'salon', 'orders', 'reservations', 'kitchen'],
    entryPoints: [
      { surface: 'salon', placement: 'panel', priority: 1, enabled: true },
      { surface: 'dashboard', placement: 'hero', priority: 2, enabled: true },
      { surface: 'dashboard', placement: 'dock', priority: 3, enabled: true },
    ],
  },
  workspaces: [
    {
      id: 'salon',
      label: 'Salón',
      routes: ['/admin/salon'],
      visible: true,
      defaultLens: 'floor',
    },
    { id: 'turno', label: 'Turno', routes: ['/admin/turno'], visible: true },
    {
      id: 'reservations',
      label: 'Reservas',
      routes: ['/admin/reservations'],
      visible: true,
    },
    { id: 'dashboard', label: 'Hoy', routes: ['/admin'], visible: true },
  ],
  tutorials: [
    {
      id: 'salon-onboarding',
      enabled: true,
      maxHints: 6,
      path: 'salon',
      hintIds: ['salon-setup', 'tables', 'opening', 'cobro'],
    },
  ],
  emptyStates: {
    salon: {
      title: 'Salón sin mesas activas',
      description: 'Abrí el turno o asigná la primera mesa para empezar.',
      ctaHref: '/admin/salon',
      ctaLabel: 'Ir al salón',
    },
    reservations: {
      title: 'Sin reservas hoy',
      description: 'Compartí tu link de reservas o activá el módulo.',
      ctaHref: '/admin/reservations',
      ctaLabel: 'Ver reservas',
    },
  },
  terminology: {
    ordersLabel: 'Comanda',
    salonLabel: 'Salón',
    dashboardTitle: 'Tu salón hoy',
    turnLabel: 'Turno en vivo',
    branchLabel: 'Local',
  },
  workflows: [
    {
      id: 'salon-service',
      label: 'Servicio de salón',
      stepIds: ['opening', 'floor', 'kitchen', 'cobro', 'closing'],
      priority: 1,
    },
    {
      id: 'go-live-salon',
      label: 'Arrancar salón',
      stepIds: ['salon-desktop', 'salon-cobro', 'fiscal-arca'],
      priority: 2,
    },
  ],
  systemPriorities: [
    { id: 'floor_service', weight: 1, label: 'Servicio de salón' },
    { id: 'team_coordination', weight: 2, label: 'Coordinación de equipo' },
  ],
  suppressedWidgetIds: ['delivery-teaser', 'web-publish-push'],
};
