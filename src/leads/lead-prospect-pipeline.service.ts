import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { LeadProspectBundleGeneratorService } from './lead-prospect-bundle-generator.service';
import { LeadProspectImageService } from './lead-prospect-image.service';
import { LeadProspectPackageService } from './lead-prospect-package.service';
import { LeadSalesPackageGeneratorService } from './lead-sales-package-generator.service';
import type { ProspectBundle } from '../prospect-importer/types';
import type {
  PipelineStageId,
  PipelineStageResult,
  ProspectPipelineReport,
} from './types/prospect-pipeline.types';
import type { SalesPackageContent } from './types/sales-package.types';

export interface RunProspectPipelineOptions {
  importedBy?: string;
  skipImport?: boolean;
  skipImages?: boolean;
  skipSalesPackage?: boolean;
}

const STAGE_LABELS: Record<PipelineStageId, string> = {
  research: 'Investigación web',
  bundle: 'Bundle (menú + branding)',
  validate: 'Validación de integridad',
  assets: 'Generación de imágenes',
  import: 'Import a demo Bentoo',
  qa: 'QA automático',
  'sales-package': 'Paquete comercial',
  report: 'Reporte final',
};

@Injectable()
export class LeadProspectPipelineService {
  private readonly logger = new Logger(LeadProspectPipelineService.name);

  constructor(
    private readonly bundleGenerator: LeadProspectBundleGeneratorService,
    private readonly packageService: LeadProspectPackageService,
    private readonly imageService: LeadProspectImageService,
    private readonly salesPackageGenerator: LeadSalesPackageGeneratorService,
    private readonly config: ConfigService,
  ) {}

  async run(
    leadId: string,
    options?: RunProspectPipelineOptions,
  ): Promise<ProspectPipelineReport> {
    const pipelineStarted = Date.now();
    const startedAt = new Date().toISOString();
    const stages: PipelineStageResult[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
    let bundle: ProspectBundle | null = null;
    let slug: string | undefined;
    let demoUrl: string | undefined;
    let salesPackage: SalesPackageContent | null | undefined = null;
    let success = true;

    const runStage = async <T>(
      id: PipelineStageId,
      fn: () => Promise<{
        message?: string;
        warnings?: string[];
        details?: Record<string, unknown>;
        result?: T;
      }>,
    ): Promise<T | undefined> => {
      const stageStart = Date.now();
      const stage: PipelineStageResult = {
        id,
        label: STAGE_LABELS[id],
        status: 'running',
        startedAt: new Date(stageStart).toISOString(),
      };
      stages.push(stage);

      try {
        const output = await fn();
        stage.status = 'passed';
        stage.completedAt = new Date().toISOString();
        stage.durationMs = Date.now() - stageStart;
        stage.message = output.message;
        stage.warnings = output.warnings;
        stage.details = output.details;
        if (output.warnings?.length) {
          warnings.push(...output.warnings);
        }
        return output.result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stage.status = 'failed';
        stage.completedAt = new Date().toISOString();
        stage.durationMs = Date.now() - stageStart;
        stage.message = message;
        errors.push(`${STAGE_LABELS[id]}: ${message}`);
        success = false;
        throw error;
      }
    };

    try {
      await runStage('research', async () => ({
        message: 'Investigación incluida en generación del bundle',
        details: { note: 'Google Search + contexto del lead' },
      }));

      const generation = await runStage('bundle', async () => {
        const result = await this.bundleGenerator.generateForLead(leadId);
        bundle = result.bundle;
        slug =
          result.bundle.builder?.bentooImport?.demoSlug ??
          result.bundle.prospect.id;
        if (result.validation.warnings.length) {
          warnings.push(...result.validation.warnings);
        }
        if (result.validation.errors.length) {
          throw new Error(
            `Bundle con ${result.validation.errors.length} errores: ${result.validation.errors.slice(0, 3).join('; ')}`,
          );
        }
        return {
          message: `${result.bundle.menu.products.length} platos · ${result.researchSummary.slice(0, 120)}…`,
          warnings: result.validation.warnings,
          details: {
            dishCount: result.bundle.menu.products.length,
            categoryCount: result.bundle.menu.categories.length,
            model: result.model,
          },
          result: result,
        };
      });

      if (!bundle && generation) {
        bundle = generation.bundle;
      }
      if (!bundle) {
        throw new Error('No se generó el bundle');
      }

      await runStage('validate', async () => {
        const report = await this.packageService.importBundleForLead(
          leadId,
          bundle!,
          { dryRun: true },
        );
        if (report.errors.length > 0) {
          throw new Error(report.errors.join('; '));
        }
        return {
          message: `OK — ${report.counts.products} platos, ${report.counts.categories} categorías`,
          warnings: report.warnings,
          details: { counts: report.counts },
        };
      });

      if (!options?.skipImages) {
        await runStage('assets', async () => {
          const imageReport = await this.imageService.generateAssetsForBundle(
            bundle!,
          );
          return {
            message: `${imageReport.generated} generadas (${imageReport.storage}) · ${imageReport.skipped} existentes · ${imageReport.failed} fallidas`,
            warnings: imageReport.warnings,
            details: imageReport as unknown as Record<string, unknown>,
          };
        });
      } else {
        stages.push({
          id: 'assets',
          label: STAGE_LABELS.assets,
          status: 'skipped',
          message: 'Omitido por opción skipImages',
        });
      }

      if (!options?.skipImport) {
        const importReport = await runStage('import', async () => {
          const report = await this.packageService.importBundleForLead(
            leadId,
            bundle!,
            { importedBy: options?.importedBy },
          );
          slug = report.slug;
          demoUrl = report.urls.demo;
          return {
            message: report.created
              ? `Demo creada: ${report.slug}`
              : `Demo actualizada: ${report.slug}`,
            warnings: report.warnings,
            details: {
              slug: report.slug,
              counts: report.counts,
              urls: report.urls,
            },
            result: report,
          };
        });

        if (importReport) {
          demoUrl = importReport.urls.demo;
        }
      } else {
        stages.push({
          id: 'import',
          label: STAGE_LABELS.import,
          status: 'skipped',
          message: 'Omitido por opción skipImport',
        });
        demoUrl = this.resolveDemoUrl(slug);
      }

      await runStage('qa', async () => {
        const qa = await this.runQaChecks(bundle!, slug);
        if (!qa.passed) {
          throw new Error(qa.failures.join('; '));
        }
        return {
          message: `${qa.checks.length} checks OK`,
          warnings: qa.warnings,
          details: { checks: qa.checks },
        };
      });

      if (!options?.skipSalesPackage) {
        salesPackage = await runStage('sales-package', async () => {
          const pkg = await this.salesPackageGenerator.generate(
            bundle!,
            demoUrl,
          );
          await this.packageService.persistSalesPackage(leadId, pkg);
          return {
            message: 'Paquete comercial generado',
            details: {
              sections: Object.keys(pkg.improvementReport).length,
              objections: pkg.objectionHandling.length,
            },
            result: pkg,
          };
        });
      } else {
        stages.push({
          id: 'sales-package',
          label: STAGE_LABELS['sales-package'],
          status: 'skipped',
          message: 'Omitido por opción skipSalesPackage',
        });
      }
    } catch {
      // stages already marked failed; continue to report
    }

    await runStage('report', async () => {
      const completedAt = new Date().toISOString();
      const draftReport: ProspectPipelineReport = {
        leadId,
        slug,
        success: success && errors.length === 0,
        startedAt,
        completedAt,
        durationMs: Date.now() - pipelineStarted,
        stages,
        demoUrl,
        warnings,
        errors,
      };
      await this.packageService.persistPipelineReport(
        leadId,
        draftReport,
        salesPackage,
      );
      return {
        message: draftReport.success
          ? 'Pipeline completado exitosamente'
          : 'Pipeline finalizado con errores',
        details: {
          success: draftReport.success,
          stageCount: stages.length,
        },
      };
    }).catch(() => {
      // report stage failure is non-fatal for return value
    });

    const report: ProspectPipelineReport = {
      leadId,
      slug,
      success: success && errors.length === 0,
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - pipelineStarted,
      stages,
      demoUrl,
      warnings,
      errors,
    };

    this.logger.log(
      `Pipeline ${report.success ? 'OK' : 'FAIL'} for lead ${leadId} (${report.durationMs}ms)`,
    );

    return report;
  }

  async getPipelineReport(leadId: string): Promise<{
    pipelineReport?: ProspectPipelineReport;
    salesPackage?: SalesPackageContent;
  }> {
    return this.packageService.getPipelineArtifacts(leadId);
  }

  private resolveDemoUrl(slug?: string): string | undefined {
    if (!slug) return undefined;
    const frontend = (
      this.config.get<string>('FRONTEND_URL') ??
      process.env.FRONTEND_URL ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
    return `${frontend}/demo/${slug}`;
  }

  private async runQaChecks(
    bundle: ProspectBundle,
    slug?: string,
  ): Promise<{
    passed: boolean;
    checks: string[];
    warnings: string[];
    failures: string[];
  }> {
    const checks: string[] = [];
    const warnings: string[] = [];
    const failures: string[] = [];

    if (bundle.menu.products.length < 5) {
      failures.push('Menú con menos de 5 platos');
    } else {
      checks.push(`Menú: ${bundle.menu.products.length} platos`);
    }

    if (bundle.menu.categories.length < 2) {
      warnings.push('Menú con pocas categorías');
    } else {
      checks.push(`${bundle.menu.categories.length} categorías`);
    }

    const generatedImages = bundle.media.images.filter(
      (i) => i.source === 'GENERATED',
    );
    if (generatedImages.length > 0 && slug) {
      const remoteReady = generatedImages.filter(
        (img) =>
          /^https?:\/\//i.test(img.filename) ||
          img.filename.startsWith('/api/uploads/'),
      );
      if (remoteReady.length >= Math.min(8, generatedImages.length)) {
        checks.push(`Assets remotos: ${remoteReady.length} en S3/proxy`);
      } else {
        const publicRoot = this.imageService.resolvePublicRoot();
        if (!publicRoot) {
          warnings.push(
            'Sin public root local; assets deberían estar en S3 (/api/uploads)',
          );
        } else {
          const basePath = bundle.media.basePath.replace(/^\//, '');
          let missing = 0;
          for (const img of generatedImages.slice(0, 8)) {
            if (
              /^https?:\/\//i.test(img.filename) ||
              img.filename.startsWith('/api/uploads/')
            ) {
              continue;
            }
            try {
              await access(path.join(publicRoot, basePath, img.filename));
            } catch {
              missing++;
            }
          }
          if (missing > 0) {
            warnings.push(`${missing} imágenes aún no están en disco`);
          } else {
            checks.push('Assets de imágenes presentes');
          }
        }
      }
    }

    if (bundle.seo?.title) {
      checks.push('SEO title configurado');
    } else {
      warnings.push('SEO title vacío');
    }

    return {
      passed: failures.length === 0,
      checks,
      warnings,
      failures,
    };
  }
}
