import { ImportReport } from './types';

/** Render humano del reporte (el objeto ImportReport ya es el formato máquina). */
export function formatReport(report: ImportReport): string {
  const lines = [
    'Import Summary',
    '',
    `Restaurant:`,
    `  ${report.restaurantName}`,
    '',
    `Restaurant ID:`,
    `  ${report.restaurantId ?? '(no persistido)'}`,
    '',
    `Slug:`,
    `  ${report.slug}`,
    '',
    `Mode:`,
    `  ${
      report.restaurantId === null
        ? 'dry run (not persisted)'
        : report.created
          ? 'created'
          : 'updated (idempotent re-import)'
    }`,
    '',
    `Products:`,
    `  ${report.counts.products} imported`,
    '',
    `Categories:`,
    `  ${report.counts.categories} imported`,
    '',
    `Sections:`,
    `  ${report.counts.sectionsActive} active`,
    '',
    `Images:`,
    `  ${report.counts.images} registered`,
    '',
    `SEO:`,
    `  ${report.counts.seoCompleted ? 'completed' : 'missing'}`,
    '',
    `Warnings:`,
    `  ${report.warnings.length}`,
    ...report.warnings.map((w) => `  - ${w}`),
    '',
    `Errors:`,
    `  ${report.errors.length}`,
    ...report.errors.map((e) => `  - ${e}`),
    '',
    `Duration:`,
    `  ${(report.durationMs / 1000).toFixed(1)} seconds`,
  ];

  return lines.join('\n');
}
