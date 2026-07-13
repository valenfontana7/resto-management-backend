import type {
  BusinessPriority,
  FocusArea,
  OperationalModel,
  OperationalProfileRecord,
} from '../operational-profile/operational-profile.types';

export const EXPERIENCE_SCHEMA_VERSION = 1 as const;

export const OPERATIONAL_EXPERIENCE_PROFILE_IDS = [
  'digital-only',
  'delivery-first',
  'restaurant-standard',
  'full-service',
  'multi-branch',
  'franchise-enterprise',
] as const;

export type OperationalExperienceProfileId =
  (typeof OPERATIONAL_EXPERIENCE_PROFILE_IDS)[number];

export type DashboardMoment = 'setup' | 'active' | 'optimize';

export type ExperienceModuleId =
  | 'menu'
  | 'orders'
  | 'salon'
  | 'tables'
  | 'delivery'
  | 'reservations'
  | 'kitchen'
  | 'analytics'
  | 'loyalty'
  | 'reviews'
  | 'promotions'
  | 'builder'
  | 'integrations'
  | 'multi_branch';

export type ExperienceModuleState = 'available' | 'locked' | 'hidden';

export type ExperienceNavIconId =
  | 'layout-dashboard'
  | 'utensils-crossed'
  | 'chef-hat'
  | 'grid-3x3'
  | 'bar-chart-3'
  | 'truck'
  | 'navigation'
  | 'settings'
  | 'palette'
  | 'layout-template'
  | 'clipboard-list'
  | 'calendar'
  | 'credit-card'
  | 'gift'
  | 'message-square'
  | 'award'
  | 'wrench'
  | 'trending-up'
  | 'landmark'
  | 'concierge-bell'
  | 'file-text'
  | 'calendar-clock'
  | 'heart-pulse'
  | 'rocket'
  | 'book-open'
  | 'users'
  | 'package'
  | 'globe'
  | 'wallet'
  | 'plug'
  | 'flask-conical';

export interface ExperienceInferenceTrace {
  profileId: OperationalExperienceProfileId;
  source: 'override' | 'inferred';
  scoreByProfile: Partial<Record<OperationalExperienceProfileId, number>>;
  signals: string[];
}

export interface ExperienceNavItem {
  href: string;
  label: string;
  description: string;
  iconId: ExperienceNavIconId;
  visible: boolean;
  locked: boolean;
  lockedReason?: string;
  sidebarTier: 'core' | 'extended';
  permission?: string;
  moduleId?: ExperienceModuleId;
}

export interface ExperienceNavGroup {
  id: string;
  label: string;
  shortLabel: string;
  iconId: ExperienceNavIconId;
  visible: boolean;
  deprioritized: boolean;
  exploreBadge: boolean;
  items: ExperienceNavItem[];
}

export interface ExperienceCommand {
  id: string;
  label: string;
  href: string;
  shortcut?: string;
}

export interface ExperienceWidgetSlot {
  id: string;
  order: number;
  visible: boolean;
  variant?: string;
  moment?: DashboardMoment | 'all';
}

export interface ExperienceKpiSlot {
  id: string;
  order: number;
  visible: boolean;
  label?: string;
}

export interface ExperienceDashboardLayout {
  widgetOrder: string[];
  kpiOrder: string[];
  showQuickActions: boolean;
  showAttentionPanel: boolean;
  showBriefingHeader: boolean;
}

export interface ExperienceQuickAction {
  id: string;
  href: string;
  label: string;
  description: string;
  iconId: ExperienceNavIconId;
  visible: boolean;
  locked: boolean;
  variant: DashboardMoment | 'all';
  order: number;
}

export interface CopilotEntryPoint {
  surface: string;
  placement: 'hero' | 'dock' | 'panel' | 'inline';
  priority: number;
  enabled: boolean;
}

export interface ExperienceCopilotConfig {
  enabled: boolean;
  entryPoints: CopilotEntryPoint[];
  specialistName: string;
  tagline: string;
  surfaces: string[];
  insightIdPrefixes: string[];
  suppressedInsightPrefixes: string[];
  domainUrls: Record<string, string>;
}

export interface ExperienceWorkspace {
  id: string;
  label: string;
  routes: string[];
  defaultLens?: string;
  visible: boolean;
}

export interface ExperienceTutorial {
  id: string;
  enabled: boolean;
  maxHints: number;
  path?: OperationalModel;
  hintIds: string[];
}

export interface ExperienceEmptyState {
  title: string;
  description: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export interface ExperienceTerminology {
  ordersLabel: string;
  salonLabel: string;
  dashboardTitle: string;
  turnLabel: string;
  branchLabel: string;
}

export interface ExperienceWorkflow {
  id: string;
  label: string;
  stepIds: string[];
  priority: number;
}

export interface ExperiencePriority {
  id: string;
  weight: number;
  label: string;
}

export interface ExperienceDefinition {
  schemaVersion: typeof EXPERIENCE_SCHEMA_VERSION;
  profileId: OperationalExperienceProfileId;
  profileLabel: string;
  profileDescription: string;
  inferredFrom: ExperienceInferenceTrace;

  navigation: {
    homePath: string;
    groups: ExperienceNavGroup[];
    mobileBottomNav: string[];
    commandBarCommands: ExperienceCommand[];
  };

  dashboard: {
    defaultRoute: string;
    layoutByMoment: Record<DashboardMoment, ExperienceDashboardLayout>;
    widgets: ExperienceWidgetSlot[];
    kpis: ExperienceKpiSlot[];
  };

  quickActions: ExperienceQuickAction[];
  copilot: ExperienceCopilotConfig;
  workspaces: ExperienceWorkspace[];
  tutorials: ExperienceTutorial[];
  emptyStates: Record<string, ExperienceEmptyState>;
  terminology: ExperienceTerminology;
  workflows: ExperienceWorkflow[];
  systemPriorities: ExperiencePriority[];
  modules: Record<ExperienceModuleId, ExperienceModuleState>;
}

export interface ExperienceMatchRules {
  operationalModels?: OperationalModel[];
  requiredFeatures?: Partial<Record<string, boolean>>;
  focusAreas?: FocusArea[];
  planFeatures?: string[];
  minBranchCount?: number;
  requiresFranchise?: boolean;
  weight?: number;
}

export interface PresetNavigation {
  homePath: string;
  groupOrder: string[];
  deprioritizedGroupIds: string[];
  exploreBadgeGroupIds: string[];
  itemHrefsByGroup: Record<string, string[]>;
  mobileBottomNav: string[];
  commandBarCommands: ExperienceCommand[];
}

export interface PresetDashboard {
  defaultRoute: string;
  widgets: Array<{
    id: string;
    order: number;
    moment?: DashboardMoment | 'all';
  }>;
  kpis: Array<{ id: string; order: number }>;
  layoutByMoment: Record<DashboardMoment, Partial<ExperienceDashboardLayout>>;
}

export interface PresetQuickActionCatalog {
  setup: string[];
  active: string[];
  optimize: string[];
}

export interface PresetCopilotConfig {
  specialistName: string;
  tagline: string;
  surfaces: string[];
  entryPoints: CopilotEntryPoint[];
  insightIdPrefixes: string[];
  suppressedInsightPrefixes: string[];
  domainUrls: Record<string, string>;
}

export interface ExperiencePreset {
  id: OperationalExperienceProfileId;
  label: string;
  description: string;
  match: ExperienceMatchRules;
  extends?: OperationalExperienceProfileId;
  navigation: PresetNavigation;
  dashboard: PresetDashboard;
  quickActions: PresetQuickActionCatalog;
  copilot: PresetCopilotConfig;
  workspaces: ExperienceWorkspace[];
  tutorials: ExperienceTutorial[];
  emptyStates: Record<string, ExperienceEmptyState>;
  terminology: ExperienceTerminology;
  workflows: ExperienceWorkflow[];
  systemPriorities: ExperiencePriority[];
  suppressedWidgetIds?: string[];
}

export interface RestaurantCapabilities {
  features: Record<string, boolean>;
  businessRules: Record<string, unknown> | null;
}

export interface EnabledModules {
  features: Record<string, boolean>;
}

export interface SubscriptionPlanSnapshot {
  planId: string;
  planType: string;
  isActive: boolean;
  features: Record<string, boolean>;
  limits: Record<string, number>;
}

export interface TenantConfiguration {
  productIntent?: string | null;
  isPublished: boolean;
  branchCount: number;
  isFranchise: boolean;
  onboardingIncomplete: boolean;
}

export interface ExperienceRuntimeContext {
  role: string;
  operatorMaturity: 'new' | 'veteran';
  goLiveProgress: number;
  goLiveIsReady: boolean;
  demoMode: boolean;
  ordersCount: number;
  accountAgeDays: number;
}

export interface ExperienceBuilderInput {
  restaurantId: string;
  capabilities: RestaurantCapabilities;
  operationalProfile: OperationalProfileRecord | null;
  enabledModules: EnabledModules;
  subscriptionPlan: SubscriptionPlanSnapshot;
  tenantConfig: TenantConfiguration;
  runtimeContext: ExperienceRuntimeContext;
  experienceProfileOverride: OperationalExperienceProfileId | null;
}

export interface ExperienceResponse {
  definition: ExperienceDefinition;
  generatedAt: string;
  restaurantId: string;
}

export interface ExperiencePresetSummary {
  id: OperationalExperienceProfileId;
  label: string;
  description: string;
}

export interface PlanFeatureGate {
  moduleId: ExperienceModuleId;
  planFeatureKey: string;
}

export const MODULE_TO_PLAN_FEATURE: Partial<
  Record<ExperienceModuleId, string>
> = {
  delivery: 'delivery',
  reservations: 'reservations',
  kitchen: 'kitchen_display',
  analytics: 'analytics',
  loyalty: 'loyalty',
  reviews: 'reviews',
  promotions: 'loyalty',
  multi_branch: 'multi_location',
};

export const MODULE_TO_RESTAURANT_FEATURE: Partial<
  Record<ExperienceModuleId, string | string[]>
> = {
  menu: 'menu',
  orders: 'orders',
  salon: 'salon',
  tables: 'tables',
  delivery: 'delivery',
  reservations: 'reservations',
  builder: ['menu', 'onlineOrdering'],
  integrations: ['orders', 'delivery'],
  loyalty: 'loyalty',
  reviews: 'reviews',
};

export type BusinessPriorityRef = BusinessPriority;
