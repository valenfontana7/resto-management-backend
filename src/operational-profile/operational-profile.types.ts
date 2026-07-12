export type OperationalModel = 'digital' | 'salon' | 'mixed';

export type MaturityLevel = 'basic' | 'intermediate' | 'advanced';

export type ProfileStatus = 'pending' | 'in_progress' | 'completed';

export type FocusArea =
  | 'order_fulfillment'
  | 'delivery_logistics'
  | 'web_channel'
  | 'floor_service'
  | 'reservations'
  | 'cash_control'
  | 'revenue_growth';

export type BusinessPriority =
  | 'speed'
  | 'salon_experience'
  | 'sales_growth'
  | 'margin'
  | 'team_coordination'
  | 'reliability';

export interface BusinessPriorities {
  primary: BusinessPriority;
  secondary?: BusinessPriority;
}

export interface CapabilitySnapshot {
  featuresAtCompletion: Record<string, boolean>;
  channelsDeclared: string[];
}

export const CURRENT_WIZARD_VERSION = 1;

export const WIZARD_STEP_IDS = [
  'v1:model',
  'v1:start',
  'v1:needs',
  'v1:priorities',
] as const;

export type WizardStepId = (typeof WIZARD_STEP_IDS)[number];

export interface OperationalProfileRecord {
  id: string;
  restaurantId: string;
  schemaVersion: number;
  operationalModel: OperationalModel;
  maturityLevel: MaturityLevel;
  focusAreas: FocusArea[];
  businessPriorities: BusinessPriorities;
  capabilitySnapshot: CapabilitySnapshot | null;
  profileStatus: ProfileStatus;
  completedWizardVersion: number | null;
  completedStepIds: string[];
  completedAt: Date | null;
  completedByUserId: string | null;
  migratedFromLegacy: boolean;
  migrationSource: string | null;
  dismissedHints: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface OperationalProfileProjections {
  navigation: NavigationProjection;
  dashboard: DashboardProjection;
  intelligence: IntelligencePolicy;
  goLive: GoLiveProjection;
  emptyStates: EmptyStateProjection;
  guidedExperience: GuidedExperienceProjection;
}

export interface NavigationProjection {
  primaryNavGroupOrder: string[];
  deprioritizedNavGroupIds: string[];
  exploreBadgeGroupIds: string[];
}

export interface DashboardProjection {
  heroWidget: FocusArea | 'briefing';
  suppressedWidgetIds: string[];
  quickActionFocusAreas: FocusArea[];
  kpiPriority: BusinessPriority;
}

export interface IntelligencePolicy {
  sliceWeights: Record<string, number>;
  suppressedSlices: string[];
  baselineProfile: OperationalModel;
  briefingCadence: 'setup' | 'service' | 'close' | 'weekly';
  priorityLens: BusinessPriority;
  alertBudget: number;
}

export interface GoLiveProjection {
  prioritizedStepIds: string[];
  deferredStepIds: string[];
}

export interface EmptyStateProjection {
  copyBySurface: Record<string, string>;
}

export interface GuidedExperienceProjection {
  enabled: boolean;
  path: OperationalModel;
  maxHints: number;
}

export interface OperationalProfileResponse {
  profile: OperationalProfileRecord;
  projections: OperationalProfileProjections;
  shouldShowWelcomeModal: boolean;
}
