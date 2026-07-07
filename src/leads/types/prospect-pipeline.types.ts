export type PipelineStageStatus =
  | 'pending'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped';

export type PipelineStageId =
  | 'research'
  | 'bundle'
  | 'validate'
  | 'assets'
  | 'import'
  | 'qa'
  | 'sales-package'
  | 'report';

export interface PipelineStageResult {
  id: PipelineStageId;
  label: string;
  status: PipelineStageStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  message?: string;
  warnings?: string[];
  details?: Record<string, unknown>;
}

export interface ProspectPipelineReport {
  leadId: string;
  slug?: string;
  success: boolean;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  stages: PipelineStageResult[];
  demoUrl?: string;
  warnings: string[];
  errors: string[];
}
