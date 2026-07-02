import { AiProvider } from '@prisma/client';

export interface GoalFilters {
  category?: string;
  city?: string;
  hasWebsite?: boolean;
  minReviews?: number;
  minBranches?: number;
  premium?: boolean;
  coldDays?: number;
  [key: string]: unknown;
}

export interface GoalConstraints {
  maxCostUsd?: number;
  requireApprovalForMessages?: boolean;
  skipDemo?: boolean;
  preferredProvider?: AiProvider;
  [key: string]: unknown;
}

export interface PlanningContext {
  goalId: string;
  goalType: string;
  objective: string;
  targetCount: number;
  budgetUsd?: number;
  filters: GoalFilters;
  constraints: GoalConstraints;
  priorities: Record<string, number>;
}

export interface PlanStageTemplate {
  stageKey: string;
  taskKey: string;
  label: string;
  dependsOnStages?: string[];
  scope: 'global' | 'per_entity';
  optional?: boolean;
  requiresApproval?: boolean;
}

export interface ComposedPlanStep {
  stepKey: string;
  taskKey: string;
  label: string;
  dependsOnStepIds: string[];
  input: Record<string, unknown>;
  priority: number;
  entityRef?: string;
  selectedModel?: string;
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  skipReason?: string;
  reuseFromStepId?: string;
}

export interface PlanPreviewSummary {
  taskCounts: Record<string, number>;
  totalSteps: number;
  activeSteps: number;
  skippedSteps: number;
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  estimatedConfidence: number;
  savingsUsd: number;
  risks: string[];
}

export interface GoalProgressMetrics {
  targetCount: number;
  achievedCount: number;
  progressPercent: number;
  spentUsd: number;
  estimatedRemainingUsd: number;
  estimatedRemainingMs: number;
  actualRoi: number | null;
  estimatedRoi: number | null;
}

export interface RoiMetrics {
  costPerLead: number | null;
  costPerMessage: number | null;
  costPerDemo: number | null;
  costPerResponse: number | null;
  costPerMeeting: number | null;
  cacheSavingsUsd: number;
  reuseSavingsUsd: number;
  estimatedRoi: number | null;
  actualRoi: number | null;
}

export interface TaskCapability {
  taskKey: string;
  label: string;
  category: 'code' | 'ai';
  dependsOnTaskKeys: string[];
  estimatedCostUsd: number;
  estimatedDurationMs: number;
  requiresApproval: boolean;
  cacheTtlSeconds?: number;
  preferredModels: string[];
  budgetModels: string[];
}
