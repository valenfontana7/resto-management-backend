import type {
  PipelineStageId,
  ProspectPipelineReport,
} from './types/prospect-pipeline.types';

/**
 * Progreso en memoria del pipeline (proceso Node).
 * Permite polling mientras corre sin depender de DemoExample.
 */
const progressByLeadId = new Map<string, ProspectPipelineReport>();

export const PIPELINE_STAGE_LABELS: Record<PipelineStageId, string> = {
  research: 'Investigación web',
  bundle: 'Bundle (menú + branding)',
  validate: 'Validación de integridad',
  assets: 'Generación de imágenes',
  import: 'Import a demo Bentoo',
  qa: 'QA automático',
  'sales-package': 'Paquete comercial',
  report: 'Reporte final',
};

export const ALL_PIPELINE_STAGE_IDS: PipelineStageId[] = [
  'research',
  'bundle',
  'validate',
  'assets',
  'import',
  'qa',
  'sales-package',
  'report',
];

export function buildInitialPipelineReport(
  leadId: string,
  startedAt = new Date().toISOString(),
): ProspectPipelineReport {
  return {
    leadId,
    success: false,
    startedAt,
    completedAt: startedAt,
    durationMs: 0,
    stages: ALL_PIPELINE_STAGE_IDS.map((id) => ({
      id,
      label: PIPELINE_STAGE_LABELS[id],
      status: id === 'research' ? 'running' : 'pending',
      ...(id === 'research'
        ? { startedAt, message: 'Iniciando investigación…' }
        : {}),
    })),
    warnings: [],
    errors: [],
  };
}

export function setPipelineProgress(
  leadId: string,
  report: ProspectPipelineReport,
): void {
  progressByLeadId.set(leadId, report);
}

export function getPipelineProgress(
  leadId: string,
): ProspectPipelineReport | undefined {
  return progressByLeadId.get(leadId);
}

export function clearPipelineProgress(leadId: string): void {
  progressByLeadId.delete(leadId);
}

export function isPipelineInFlight(leadId: string): boolean {
  const report = progressByLeadId.get(leadId);
  if (!report) return false;
  const reportStage = report.stages.find((s) => s.id === 'report');
  if (
    reportStage &&
    (reportStage.status === 'passed' || reportStage.status === 'failed')
  ) {
    return false;
  }
  return report.stages.some(
    (s) => s.status === 'running' || s.status === 'pending',
  );
}
