import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  BundleValidationError,
  ProspectImporterService,
} from '../prospect-importer/prospect-importer.service';
import type { ImportReport, ProspectBundle } from '../prospect-importer/types';
import { CreateDemoExampleDto } from './dto/create-demo-example.dto';
import { UpdateDemoExampleDto } from './dto/update-demo-example.dto';

@Injectable()
export class DemoExamplesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prospectImporter: ProspectImporterService,
    private readonly config: ConfigService,
  ) {}

  async findPublic() {
    const [totalPublic, data] = await this.prisma.$transaction([
      this.prisma.demoExample.count({
        where: { isPublic: true },
      }),
      this.prisma.demoExample.findMany({
        where: { isActive: true, isPublic: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);

    return {
      data,
      meta: {
        totalActive: data.length,
        hasDatabaseRecords: totalPublic > 0,
      },
    };
  }

  /**
   * Acceso por link directo (incl. demos privadas de leads).
   * No lista en el catálogo público; solo resuelve un slug activo.
   */
  async findBySlug(slug: string) {
    const normalized = this.normalizeSlug(slug);
    const example = await this.prisma.demoExample.findUnique({
      where: { slug: normalized },
    });

    if (!example || !example.isActive) {
      throw new NotFoundException(`Demo example ${slug} not found`);
    }

    return example;
  }

  async findAll() {
    return this.prisma.demoExample.findMany({
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findOne(id: string) {
    const example = await this.prisma.demoExample.findUnique({
      where: { id },
    });

    if (!example) {
      throw new NotFoundException(`Demo example ${id} not found`);
    }

    return example;
  }

  async create(dto: CreateDemoExampleDto, adminId?: string) {
    const slug = this.normalizeSlug(dto.slug);
    await this.ensureSlugAvailable(slug);

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder());
    const leadId = dto.leadId?.trim() || null;
    const isPublic = dto.isPublic ?? leadId == null;

    const example = await this.prisma.demoExample.create({
      data: {
        slug,
        name: dto.name.trim(),
        type: dto.type.trim() || 'restaurant',
        cuisine: this.normalizeStringArray(dto.cuisine),
        city: dto.city.trim(),
        neighborhood: dto.neighborhood.trim(),
        isPublic,
        leadId,
        isActive: dto.isActive ?? true,
        isFeatured: isPublic ? (dto.isFeatured ?? false) : false,
        sortOrder,
        payload: this.preparePayload(dto.payload, slug, dto.name),
        updatedBy: adminId,
      },
    });

    await this.writeAuditLog(adminId, 'CREATE_DEMO_EXAMPLE', {
      id: example.id,
      slug: example.slug,
      name: example.name,
    });

    return example;
  }

  async update(id: string, dto: UpdateDemoExampleDto, adminId?: string) {
    const current = await this.findOne(id);
    const nextSlug =
      dto.slug !== undefined ? this.normalizeSlug(dto.slug) : current.slug;

    if (nextSlug !== current.slug) {
      await this.ensureSlugAvailable(nextSlug, id);
    }

    const payload =
      dto.payload !== undefined
        ? this.preparePayload(dto.payload, nextSlug, dto.name ?? current.name)
        : undefined;

    const leadId =
      dto.leadId !== undefined ? dto.leadId?.trim() || null : current.leadId;
    const isPublic =
      dto.isPublic !== undefined
        ? dto.isPublic
        : leadId
          ? false
          : current.isPublic;

    const example = await this.prisma.demoExample.update({
      where: { id },
      data: {
        ...(dto.slug !== undefined ? { slug: nextSlug } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.type !== undefined
          ? { type: dto.type.trim() || 'restaurant' }
          : {}),
        ...(dto.cuisine !== undefined
          ? { cuisine: this.normalizeStringArray(dto.cuisine) }
          : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() } : {}),
        ...(dto.neighborhood !== undefined
          ? { neighborhood: dto.neighborhood.trim() }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isPublic !== undefined || dto.leadId !== undefined
          ? { isPublic, leadId }
          : {}),
        ...(dto.isFeatured !== undefined
          ? { isFeatured: isPublic ? dto.isFeatured : false }
          : !isPublic
            ? { isFeatured: false }
            : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(payload !== undefined ? { payload } : {}),
        updatedBy: adminId,
      },
    });

    await this.writeAuditLog(adminId, 'UPDATE_DEMO_EXAMPLE', {
      id: example.id,
      slug: example.slug,
      name: example.name,
    });

    return example;
  }

  async remove(id: string, adminId?: string) {
    const current = await this.findOne(id);

    await this.prisma.demoExample.delete({
      where: { id },
    });

    await this.writeAuditLog(adminId, 'DELETE_DEMO_EXAMPLE', {
      id: current.id,
      slug: current.slug,
      name: current.name,
    });

    return { success: true, id };
  }

  private async nextSortOrder() {
    const count = await this.prisma.demoExample.count();
    return count * 10;
  }

  private normalizeSlug(slug: string) {
    const normalized = slug
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    if (!normalized) {
      throw new BadRequestException('El slug del demo es requerido');
    }

    return normalized;
  }

  private normalizeStringArray(values: string[] = []) {
    return values
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  private preparePayload(
    payload: Record<string, unknown>,
    slug: string,
    name: string,
  ): Prisma.InputJsonValue {
    return {
      ...payload,
      slug,
      name,
    } as Prisma.InputJsonValue;
  }

  private async ensureSlugAvailable(slug: string, currentId?: string) {
    const existing = await this.prisma.demoExample.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing && existing.id !== currentId) {
      throw new ConflictException(`Ya existe un demo con el slug ${slug}`);
    }
  }

  private async writeAuditLog(
    adminId: string | undefined,
    action: string,
    details: Record<string, unknown>,
  ) {
    if (!adminId) return;

    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action,
          targetRestaurantId: null,
          details: details as Prisma.InputJsonValue,
        },
      });
    } catch {
      // El CRUD del demo no debe fallar si el audit log no pudo escribirse.
    }
  }

  assertProspectBundle(bundle: unknown): asserts bundle is ProspectBundle {
    if (!bundle || typeof bundle !== 'object') {
      throw new BundleValidationError(['El bundle debe ser un objeto JSON.']);
    }
    const candidate = bundle as ProspectBundle;
    if (!candidate.schemaVersion) {
      throw new BundleValidationError([
        'Falta schemaVersion (se espera prospect bundle v1.0).',
      ]);
    }
  }

  async importProspectBundle(
    bundleInput: ProspectBundle,
    options: {
      dryRun?: boolean;
      importedBy?: string;
      leadId?: string;
    } = {},
  ): Promise<ImportReport & { demoType: 'prospect-package' }> {
    const bundle: ProspectBundle = options.leadId
      ? {
          ...bundleInput,
          prospect: {
            ...bundleInput.prospect,
            leadId: options.leadId,
          },
        }
      : bundleInput;

    const report = await this.prospectImporter.importBundle(bundle, {
      dryRun: options.dryRun ?? false,
      frontendUrl: this.resolveFrontendUrl(),
      importedBy: options.importedBy ?? 'master-prospect-import',
    });

    if (!options.dryRun && report.restaurantId) {
      await this.stampProspectImportMetadata(
        report.restaurantId,
        report,
        options.importedBy,
      );

      if (options.leadId) {
        await this.prisma.lead.update({
          where: { id: options.leadId },
          data: { demoExampleSlug: report.slug },
        });
      }

      await this.writeAuditLog(
        options.importedBy,
        'demo.prospect_bundle.import',
        {
          slug: report.slug,
          created: report.created,
          leadId: options.leadId ?? null,
          counts: report.counts,
        },
      );
    }

    return { ...report, demoType: 'prospect-package' };
  }

  private async stampProspectImportMetadata(
    demoExampleId: string,
    report: ImportReport,
    importedBy?: string,
  ) {
    const record = await this.prisma.demoExample.findUniqueOrThrow({
      where: { id: demoExampleId },
      select: { payload: true },
    });
    const payload = (record.payload as Record<string, unknown>) ?? {};
    const importMeta = {
      importedAt: new Date().toISOString(),
      importedBy,
      created: report.created,
      counts: report.counts,
      warnings: report.warnings,
      durationMs: report.durationMs,
    };

    await this.prisma.demoExample.update({
      where: { id: demoExampleId },
      data: {
        payload: {
          ...payload,
          _prospectPackageImport: importMeta,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private resolveFrontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ??
      process.env.FRONTEND_URL ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}
