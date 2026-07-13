import { projectOperationalProfile } from '../operational-profile/operational-profile-projector';
import {
  EXPERIENCE_SCHEMA_VERSION,
  MODULE_TO_PLAN_FEATURE,
  MODULE_TO_RESTAURANT_FEATURE,
  type DashboardMoment,
  type ExperienceBuilderInput,
  type ExperienceDefinition,
  type ExperienceModuleId,
  type ExperienceModuleState,
  type ExperienceNavGroup,
  type ExperienceNavItem,
  type ExperienceQuickAction,
  type ExperienceWidgetSlot,
} from './experience.types';
import { getNavCatalogEntry, NAV_GROUP_META } from './nav-catalog';
import { getExperiencePreset } from './presets';
import { resolveProfileId } from './resolve-profile-id';

const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ['*'],
  MANAGER: ['*'],
  SUPER_ADMIN: ['*'],
  WAITER: ['dashboard', 'orders', 'salon', 'tables', 'menu'],
  CHEF: ['kitchen', 'orders'],
  KITCHEN: ['kitchen', 'orders'],
  CASHIER: ['dashboard', 'orders', 'salon', 'billing'],
  DELIVERY: ['delivery'],
};

const DELIVERY_ONLY_ROLES = new Set(['DELIVERY']);

function normalizeRole(role: string): string {
  return (role ?? 'OWNER').toUpperCase();
}

function roleHasPermission(role: string, permission?: string): boolean {
  if (!permission) return true;
  const perms = ROLE_PERMISSIONS[normalizeRole(role)] ?? ROLE_PERMISSIONS.OWNER;
  if (perms.includes('*')) return true;
  return perms.includes(permission);
}

function isRestaurantFeatureEnabled(
  features: Record<string, boolean>,
  restaurantFeature?: string,
  restaurantFeatures?: string[],
): boolean {
  if (restaurantFeatures?.length) {
    return restaurantFeatures.some((f) => features[f] ?? false);
  }
  if (!restaurantFeature) return true;
  return features[restaurantFeature] ?? false;
}

function resolveModuleState(
  moduleId: ExperienceModuleId,
  input: ExperienceBuilderInput,
): ExperienceModuleState {
  const planKey = MODULE_TO_PLAN_FEATURE[moduleId];
  const restaurantKey = MODULE_TO_RESTAURANT_FEATURE[moduleId];

  if (planKey && !input.subscriptionPlan.features[planKey]) {
    return input.subscriptionPlan.isActive ? 'locked' : 'locked';
  }

  if (restaurantKey) {
    const keys = Array.isArray(restaurantKey) ? restaurantKey : [restaurantKey];
    const enabled = keys.some((k) => input.enabledModules.features[k] ?? false);
    if (!enabled) return 'hidden';
  }

  return 'available';
}

function buildModules(
  input: ExperienceBuilderInput,
): Record<ExperienceModuleId, ExperienceModuleState> {
  const moduleIds: ExperienceModuleId[] = [
    'menu',
    'orders',
    'salon',
    'tables',
    'delivery',
    'reservations',
    'kitchen',
    'analytics',
    'loyalty',
    'reviews',
    'promotions',
    'builder',
    'integrations',
    'multi_branch',
  ];

  return Object.fromEntries(
    moduleIds.map((id) => [id, resolveModuleState(id, input)]),
  ) as Record<ExperienceModuleId, ExperienceModuleState>;
}

function buildNavItem(
  href: string,
  input: ExperienceBuilderInput,
  role: string,
): ExperienceNavItem | null {
  const entry = getNavCatalogEntry(href);
  if (!entry) return null;

  const features = input.enabledModules.features;
  const isFounder = normalizeRole(role) === 'SUPER_ADMIN';

  const restaurantOk = isRestaurantFeatureEnabled(
    features,
    entry.restaurantFeature,
    entry.restaurantFeatures,
  );

  const planLocked =
    !isFounder &&
    Boolean(entry.planFeature) &&
    !input.subscriptionPlan.features[entry.planFeature!];

  const roleOk = roleHasPermission(role, entry.permission);

  let visible = restaurantOk && roleOk;

  if (DELIVERY_ONLY_ROLES.has(normalizeRole(role))) {
    if (href === '/admin/delivery') visible = false;
    if (href !== '/admin/delivery/mis-envios' && href !== '/admin') {
      visible = visible && href.includes('mis-envios');
    }
  }

  if (
    href === '/admin/delivery/mis-envios' &&
    normalizeRole(role) !== 'DELIVERY'
  ) {
    // driver nav handled separately on frontend for now
  }

  return {
    href: entry.href,
    label: entry.label,
    description: entry.description,
    iconId: entry.iconId,
    visible,
    locked: planLocked && visible,
    lockedReason: planLocked ? 'Requiere plan superior' : undefined,
    sidebarTier: entry.sidebarTier,
    permission: entry.permission,
    moduleId: entry.moduleId as ExperienceModuleId | undefined,
  };
}

function buildNavigation(
  input: ExperienceBuilderInput,
  profileProjections: ReturnType<typeof projectOperationalProfile> | null,
): ExperienceDefinition['navigation'] {
  const preset = getExperiencePreset(resolveProfileId(input).profileId)!;
  const role = input.runtimeContext.role;
  const navProjection = profileProjections?.navigation;

  const groupOrder = navProjection?.primaryNavGroupOrder?.length
    ? navProjection.primaryNavGroupOrder
    : preset.navigation.groupOrder;

  const deprioritized = new Set(
    navProjection?.deprioritizedNavGroupIds ??
      preset.navigation.deprioritizedGroupIds,
  );
  const exploreBadge = new Set(
    navProjection?.exploreBadgeGroupIds ??
      preset.navigation.exploreBadgeGroupIds,
  );

  const groups: ExperienceNavGroup[] = [];

  for (const groupId of groupOrder) {
    const meta = NAV_GROUP_META[groupId];
    if (!meta) continue;

    const hrefs = preset.navigation.itemHrefsByGroup[groupId] ?? [];
    const items = hrefs
      .map((href) => buildNavItem(href, input, role))
      .filter(
        (item): item is ExperienceNavItem => item !== null && item.visible,
      );

    if (items.length === 0) continue;

    groups.push({
      id: groupId,
      label: meta.label,
      shortLabel: meta.shortLabel,
      iconId: meta.iconId,
      visible: true,
      deprioritized: deprioritized.has(groupId),
      exploreBadge: exploreBadge.has(groupId),
      items,
    });
  }

  const mobileBottomNav = preset.navigation.mobileBottomNav.filter((href) => {
    const item = buildNavItem(href, input, role);
    return item?.visible;
  });

  return {
    homePath: preset.navigation.homePath,
    groups,
    mobileBottomNav,
    commandBarCommands: preset.navigation.commandBarCommands.filter((cmd) => {
      const item = buildNavItem(cmd.href, input, role);
      return item?.visible;
    }),
  };
}

function buildQuickActions(
  input: ExperienceBuilderInput,
  moment: DashboardMoment,
): ExperienceQuickAction[] {
  const preset = getExperiencePreset(resolveProfileId(input).profileId)!;
  const role = input.runtimeContext.role;

  const hrefs =
    moment === 'setup'
      ? preset.quickActions.setup
      : moment === 'optimize'
        ? preset.quickActions.optimize
        : preset.quickActions.active;

  const actions: ExperienceQuickAction[] = [];

  for (const [index, href] of hrefs.entries()) {
    const item = buildNavItem(href, input, role);
    if (!item?.visible) continue;
    actions.push({
      id: `qa-${href}`,
      href: item.href,
      label: item.label,
      description: item.description,
      iconId: item.iconId,
      visible: true,
      locked: item.locked,
      variant: moment,
      order: index,
    });
  }

  return actions;
}

function applyWidgetSuppression(
  widgets: ExperienceWidgetSlot[],
  suppressedIds: string[],
  operatorMaturity: 'new' | 'veteran',
): ExperienceWidgetSlot[] {
  const suppressed = new Set(suppressedIds);
  if (operatorMaturity === 'veteran') {
    suppressed.add('setup-assistant');
    suppressed.add('go-live-badge');
  }

  return widgets.map((w) => ({
    ...w,
    visible: !suppressed.has(w.id),
  }));
}

export function buildExperienceDefinition(
  input: ExperienceBuilderInput,
): ExperienceDefinition {
  const inference = resolveProfileId(input);
  const preset = getExperiencePreset(inference.profileId);

  if (!preset) {
    throw new Error(`Experience preset not found: ${inference.profileId}`);
  }

  const profileProjections = input.operationalProfile
    ? projectOperationalProfile(input.operationalProfile, {
        role: input.runtimeContext.role,
        planType: input.subscriptionPlan.planType,
        operatorMaturity: input.runtimeContext.operatorMaturity,
        features: input.enabledModules.features,
      })
    : null;

  const suppressedWidgets = [
    ...(preset.suppressedWidgetIds ?? []),
    ...(profileProjections?.dashboard.suppressedWidgetIds ?? []),
  ];

  const widgets: ExperienceWidgetSlot[] = applyWidgetSuppression(
    preset.dashboard.widgets.map((w) => ({
      id: w.id,
      order: w.order,
      visible: true,
      moment: w.moment,
    })),
    suppressedWidgets,
    input.runtimeContext.operatorMaturity,
  );

  const layoutByMoment = {
    setup: {
      ...preset.dashboard.layoutByMoment.setup,
      widgetOrder:
        preset.dashboard.layoutByMoment.setup?.widgetOrder ??
        widgets
          .filter((w) => w.moment === 'setup' || w.moment === 'all')
          .map((w) => w.id),
      kpiOrder: preset.dashboard.layoutByMoment.setup?.kpiOrder ?? [],
      showQuickActions:
        preset.dashboard.layoutByMoment.setup?.showQuickActions ?? true,
      showAttentionPanel:
        preset.dashboard.layoutByMoment.setup?.showAttentionPanel ?? false,
      showBriefingHeader:
        preset.dashboard.layoutByMoment.setup?.showBriefingHeader ?? false,
    },
    active: {
      ...preset.dashboard.layoutByMoment.active,
      widgetOrder:
        preset.dashboard.layoutByMoment.active?.widgetOrder ??
        widgets
          .filter((w) => w.moment === 'active' || w.moment === 'all')
          .map((w) => w.id),
      kpiOrder:
        preset.dashboard.layoutByMoment.active?.kpiOrder ??
        preset.dashboard.kpis.map((k) => k.id),
      showQuickActions:
        preset.dashboard.layoutByMoment.active?.showQuickActions ?? true,
      showAttentionPanel:
        preset.dashboard.layoutByMoment.active?.showAttentionPanel ?? true,
      showBriefingHeader:
        preset.dashboard.layoutByMoment.active?.showBriefingHeader ?? true,
    },
    optimize: {
      ...preset.dashboard.layoutByMoment.optimize,
      widgetOrder:
        preset.dashboard.layoutByMoment.optimize?.widgetOrder ??
        widgets
          .filter((w) => w.moment === 'optimize' || w.moment === 'all')
          .map((w) => w.id),
      kpiOrder: preset.dashboard.layoutByMoment.optimize?.kpiOrder ?? [],
      showQuickActions:
        preset.dashboard.layoutByMoment.optimize?.showQuickActions ?? true,
      showAttentionPanel:
        preset.dashboard.layoutByMoment.optimize?.showAttentionPanel ?? false,
      showBriefingHeader:
        preset.dashboard.layoutByMoment.optimize?.showBriefingHeader ?? true,
    },
  };

  const quickActions = [
    ...buildQuickActions(input, 'setup'),
    ...buildQuickActions(input, 'active'),
    ...buildQuickActions(input, 'optimize'),
  ];

  const intelligenceSuppressed =
    profileProjections?.intelligence.suppressedSlices ?? [];

  return {
    schemaVersion: EXPERIENCE_SCHEMA_VERSION,
    profileId: inference.profileId,
    profileLabel: preset.label,
    profileDescription: preset.description,
    inferredFrom: inference,
    navigation: buildNavigation(input, profileProjections),
    dashboard: {
      defaultRoute: preset.dashboard.defaultRoute,
      layoutByMoment,
      widgets,
      kpis: preset.dashboard.kpis.map((k) => ({
        id: k.id,
        order: k.order,
        visible: true,
      })),
    },
    quickActions,
    copilot: {
      enabled: !input.runtimeContext.demoMode,
      entryPoints: preset.copilot.entryPoints,
      specialistName: preset.copilot.specialistName,
      tagline: preset.copilot.tagline,
      surfaces: preset.copilot.surfaces,
      insightIdPrefixes: preset.copilot.insightIdPrefixes,
      suppressedInsightPrefixes: [
        ...preset.copilot.suppressedInsightPrefixes,
        ...intelligenceSuppressed.map((s) => `${s}`),
      ],
      domainUrls: preset.copilot.domainUrls,
    },
    workspaces: preset.workspaces.map((w) => ({ ...w })),
    tutorials: preset.tutorials.map((t) => ({
      ...t,
      enabled: t.enabled && input.runtimeContext.operatorMaturity === 'new',
    })),
    emptyStates: { ...preset.emptyStates },
    terminology: { ...preset.terminology },
    workflows: [...preset.workflows],
    systemPriorities: [...preset.systemPriorities],
    modules: buildModules(input),
  };
}
