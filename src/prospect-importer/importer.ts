import { Prisma } from '@prisma/client';
import { loadBundleFromFile } from './parser';
import { validateBundle } from './validator';
import { mapBundle } from './mapper';
import { ImportLogger } from './logger';
import { ImportPrisma, runImportTransaction } from './transaction';
import { ImportReport, MappedImport, ProspectBundle } from './types';

export class BundleValidationError extends Error {
  constructor(readonly validationErrors: string[]) {
    super(
      `El bundle no pasó la validación (${validationErrors.length} errores).`,
    );
    this.name = 'BundleValidationError';
  }
}

export interface ImportOptions {
  /** Solo validar y mapear, sin tocar la base. */
  dryRun?: boolean;
  /** Base del frontend para armar las URLs del reporte. */
  frontendUrl?: string;
  /** Usuario que ejecuta el import (queda en updatedBy). */
  importedBy?: string;
}

/**
 * Pipeline canónico: bundle → validación → normalización/mapeo → transacción → reporte.
 * Idempotente: reimportar el mismo bundle actualiza el registro existente por slug.
 */
export class ProspectImporter {
  constructor(
    private readonly prisma: ImportPrisma,
    private readonly logger: ImportLogger = new ImportLogger(),
  ) {}

  async importFromFile(
    bundlePath: string,
    options: ImportOptions = {},
  ): Promise<ImportReport> {
    const bundle = await this.logger.step('load-bundle', () =>
      loadBundleFromFile(bundlePath),
    );
    return this.importBundle(bundle, options);
  }

  async importBundle(
    bundle: ProspectBundle,
    options: ImportOptions = {},
  ): Promise<ImportReport> {
    const startedAt = Date.now();

    const validation = await this.logger.step('validate', () =>
      validateBundle(bundle),
    );
    if (validation.errors.length > 0) {
      for (const error of validation.errors)
        this.logger.error('validate', error);
      throw new BundleValidationError(validation.errors);
    }
    for (const warning of validation.warnings)
      this.logger.warn('validate', warning);

    const mapped = await this.logger.step('map', () => mapBundle(bundle));
    for (const warning of mapped.warnings) this.logger.warn('map', warning);

    const warnings = [...validation.warnings, ...mapped.warnings];

    let restaurantId: string | null = null;
    let created = false;

    if (!options.dryRun) {
      const persisted = await this.logger.step('persist', () =>
        this.persist(mapped, options.importedBy),
      );
      restaurantId = persisted.id;
      created = persisted.created;
      this.logger.info('commit', 'Transaction committed', { id: persisted.id });
    } else {
      this.logger.info('persist', 'Dry run: se omite la persistencia.');
    }

    return this.buildReport(mapped, {
      restaurantId,
      created,
      warnings,
      durationMs: Date.now() - startedAt,
      frontendUrl: options.frontendUrl,
    });
  }

  /**
   * Upsert por slug dentro de una transacción. Un solo registro agrupa
   * restaurante, branding, theme, menú, media, secciones, SEO y navegación,
   * por lo que la idempotencia queda garantizada por la unicidad del slug.
   */
  private async persist(mapped: MappedImport, importedBy?: string) {
    return runImportTransaction(this.prisma, async (tx) => {
      const existing = await tx.demoExample.findUnique({
        where: { slug: mapped.record.slug },
        select: { id: true, sortOrder: true },
      });

      const data = {
        name: mapped.record.name,
        type: mapped.record.type,
        cuisine: mapped.record.cuisine,
        city: mapped.record.city,
        neighborhood: mapped.record.neighborhood,
        isPublic: mapped.record.isPublic,
        leadId: mapped.record.leadId,
        isActive: mapped.record.isActive,
        isFeatured: mapped.record.isFeatured,
        payload: mapped.payload as Prisma.InputJsonValue,
        updatedBy: importedBy ?? 'prospect-importer',
      };

      if (existing) {
        const updated = await tx.demoExample.update({
          where: { id: existing.id },
          // Reimport conserva el sortOrder ajustado manualmente.
          data: { ...data, sortOrder: existing.sortOrder },
        });
        return { id: updated.id, created: false };
      }

      const createdRecord = await tx.demoExample.create({
        data: {
          ...data,
          slug: mapped.record.slug,
          sortOrder: mapped.record.sortOrder,
        },
      });
      return { id: createdRecord.id, created: true };
    });
  }

  private buildReport(
    mapped: MappedImport,
    result: {
      restaurantId: string | null;
      created: boolean;
      warnings: string[];
      durationMs: number;
      frontendUrl?: string;
    },
  ): ImportReport {
    const frontend = (result.frontendUrl ?? 'http://localhost:3000').replace(
      /\/$/,
      '',
    );
    const slug = mapped.record.slug;

    return {
      success: true,
      restaurantName: mapped.record.name,
      restaurantId: result.restaurantId,
      slug,
      created: result.created,
      counts: mapped.counts,
      warnings: result.warnings,
      errors: [],
      durationMs: result.durationMs,
      steps: this.logger.getSteps(),
      urls: {
        demo: `${frontend}/demo/${slug}`,
        demoAdmin: `${frontend}/demo/admin/${slug}`,
        masterEditor: `${frontend}/master/demo-examples`,
      },
    };
  }
}
