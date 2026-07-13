import type { ExperiencePreset } from '../experience.types';
import {
  BASE_COPILOT,
  DEFAULT_LAYOUT_BY_MOMENT,
  baseNavigation,
} from './preset-shared';

export const multiBranchPreset: ExperiencePreset = {
  id: 'multi-branch',
  label: 'Varias sucursales',
  description:
    'Varios locales bajo una misma cuenta. Vista consolidada y supervisión de sucursales.',
  match: {
    planFeatures: ['multi_location'],
    minBranchCount: 2,
    weight: 20,
  },
  extends: 'full-service',
  navigation: baseNavigation({
    homePath: '/admin',
    groupOrder: ['negocio', 'operacion', 'ventas', 'config'],
    itemHrefsByGroup: {
      operacion: [
        '/admin/turno',
        '/admin/salon',
        '/admin/delivery',
        '/kitchen',
        '/admin/packs/operations',
      ],
      negocio: [
        '/admin/negocio',
        '/admin/negocio?tab=margenes',
        '/admin/negocio?tab=decisiones',
        '/admin/analytics',
        '/admin/packs/customers',
        '/admin/packs/inventory',
        '/admin/diario',
        '/admin/caja-mayor',
      ],
      ventas: ['/admin/menu', '/admin/builder', '/admin/promotions'],
      config: ['/admin/settings', '/admin/subscription', '/admin/go-live'],
    },
    mobileBottomNav: [
      '/admin',
      '/admin/negocio',
      '/admin/turno',
      '/admin/settings',
    ],
    commandBarCommands: [
      { id: 'home', label: 'Hoy', href: '/admin', shortcut: 'G H' },
      { id: 'negocio', label: 'Negocio', href: '/admin/negocio' },
      { id: 'analytics', label: 'Ventas', href: '/admin/analytics' },
      { id: 'settings', label: 'Ajustes', href: '/admin/settings' },
    ],
  }),
  dashboard: {
    defaultRoute: '/admin',
    widgets: [
      { id: 'branch-switcher', order: 1, moment: 'all' },
      { id: 'business-health-teaser', order: 2, moment: 'all' },
      { id: 'today-summary', order: 3, moment: 'all' },
      { id: 'quick-actions', order: 4, moment: 'all' },
      { id: 'weekly-recap', order: 5, moment: 'optimize' },
    ],
    kpis: [
      { id: 'sales-consolidated', order: 1 },
      { id: 'branches-active', order: 2 },
      { id: 'margin-signal', order: 3 },
    ],
    layoutByMoment: {
      ...DEFAULT_LAYOUT_BY_MOMENT,
      active: {
        ...DEFAULT_LAYOUT_BY_MOMENT.active,
        widgetOrder: [
          'branch-switcher',
          'business-health-teaser',
          'today-summary',
          'quick-actions',
        ],
      },
    },
  },
  quickActions: {
    setup: ['/admin/settings', '/admin/menu', '/admin/go-live'],
    active: [
      '/admin/negocio',
      '/admin/analytics',
      '/admin/turno',
      '/admin/salon',
    ],
    optimize: [
      '/admin/negocio?tab=decisiones',
      '/admin/packs/inventory',
      '/admin/diario',
    ],
  },
  copilot: {
    ...BASE_COPILOT,
    specialistName: 'Tu red',
    tagline: 'Tus sucursales — te digo dónde conviene actuar primero',
    surfaces: ['dashboard', 'executive', 'analytics'],
    entryPoints: [
      { surface: 'dashboard', placement: 'hero', priority: 1, enabled: true },
      { surface: 'executive', placement: 'panel', priority: 1, enabled: true },
    ],
    domainUrls: {
      ...BASE_COPILOT.domainUrls,
      growthUrl: '/admin/negocio',
      ordersUrl: '/admin/turno',
    },
  },
  workspaces: [
    {
      id: 'executive',
      label: 'Red',
      routes: ['/admin/negocio'],
      visible: true,
    },
    {
      id: 'operations',
      label: 'Operación',
      routes: ['/admin/turno', '/admin/salon'],
      visible: true,
    },
    { id: 'dashboard', label: 'Hoy', routes: ['/admin'], visible: true },
  ],
  tutorials: [
    {
      id: 'multi-branch-tour',
      enabled: true,
      maxHints: 3,
      hintIds: ['branch-switch', 'consolidated-kpis'],
    },
  ],
  emptyStates: {
    branches: {
      title: 'Una sucursal activa',
      description:
        'Agregá otra sucursal para desbloquear la vista consolidada.',
      ctaHref: '/admin/settings',
      ctaLabel: 'Gestionar sucursales',
    },
  },
  terminology: {
    ordersLabel: 'Pedido',
    salonLabel: 'Salón',
    dashboardTitle: 'Tu red hoy',
    turnLabel: 'Turno',
    branchLabel: 'Sucursal',
  },
  workflows: [
    {
      id: 'branch-oversight',
      label: 'Supervisión de red',
      stepIds: ['consolidated-review', 'branch-compare'],
      priority: 1,
    },
  ],
  systemPriorities: [
    { id: 'revenue_growth', weight: 1, label: 'Crecimiento de red' },
    { id: 'reliability', weight: 2, label: 'Consistencia operativa' },
  ],
};
