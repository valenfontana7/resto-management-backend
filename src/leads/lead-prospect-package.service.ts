import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Lead, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProspectImporterService } from '../prospect-importer/prospect-importer.service';
import { BundleValidationError } from '../prospect-importer/importer';
import type { ImportReport, ProspectBundle } from '../prospect-importer/types';
import type { ProspectPipelineReport } from './types/prospect-pipeline.types';
import type { SalesPackageContent } from './types/sales-package.types';

type DemoPayload = Record<string, unknown>;

export interface ProspectPackageImportMeta {
  importedAt: string;
  importedBy?: string;
  created: boolean;
  counts: ImportReport['counts'];
  warnings: string[];
  durationMs: number;
}

export interface LeadProspectPackageStatus {
  leadId: string;
  status: 'none' | 'imported' | 'template-demo';
  demoType: 'prospect-package' | 'template' | null;
  slug?: string;
  demoExampleId?: string;
  restaurantName?: string;
  urls?: ImportReport['urls'];
  importMeta?: ProspectPackageImportMeta;
  pipelineReport?: ProspectPipelineReport;
  salesPackage?: Pick<SalesPackageContent, 'generatedAt' | 'executiveSummary'>;
}

@Injectable()
export class LeadProspectPackageService {
  private readonly logger = new Logger(LeadProspectPackageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prospectImporter: ProspectImporterService,
    private readonly config: ConfigService,
  ) {}

  async getPackageStatus(leadId: string): Promise<LeadProspectPackageStatus> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const demo = await this.findLinkedDemo(lead);

    if (!demo) {
      return { leadId, status: 'none', demoType: null };
    }

    const payload = demo.payload as DemoPayload;
    const isProspectPackage = this.isProspectPackagePayload(payload);
    const importMeta = payload._prospectPackageImport as
      | ProspectPackageImportMeta
      | undefined;
    const frontendUrl = this.resolveFrontendUrl();

    const pipelineReport = payload._pipelineReport as
      | ProspectPipelineReport
      | undefined;
    const salesPackage = payload._salesPackage as
      | SalesPackageContent
      | undefined;

    return {
      leadId,
      status: isProspectPackage ? 'imported' : 'template-demo',
      demoType: isProspectPackage ? 'prospect-package' : 'template',
      slug: demo.slug,
      demoExampleId: demo.id,
      restaurantName: demo.name,
      urls: {
        demo: `${frontendUrl}/demo/${demo.slug}`,
        demoAdmin: `${frontendUrl}/demo/admin/${demo.slug}`,
        masterEditor: `${frontendUrl}/master/demo-examples`,
      },
      importMeta,
      pipelineReport,
      salesPackage: salesPackage
        ? {
            generatedAt: salesPackage.generatedAt,
            executiveSummary: salesPackage.executiveSummary,
          }
        : undefined,
    };
  }

  async persistPipelineReport(
    leadId: string,
    report: ProspectPipelineReport,
    salesPackage?: SalesPackageContent | null,
  ): Promise<void> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const demo = await this.findLinkedDemo(lead);
    if (!demo) return;

    const payload = (demo.payload as DemoPayload) ?? {};
    await this.prisma.demoExample.update({
      where: { id: demo.id },
      data: {
        payload: {
          ...payload,
          _pipelineReport: report,
          ...(salesPackage ? { _salesPackage: salesPackage } : {}),
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async persistSalesPackage(
    leadId: string,
    salesPackage: SalesPackageContent,
  ): Promise<void> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const demo = await this.findLinkedDemo(lead);
    if (!demo) return;

    const payload = (demo.payload as DemoPayload) ?? {};
    await this.prisma.demoExample.update({
      where: { id: demo.id },
      data: {
        payload: {
          ...payload,
          _salesPackage: salesPackage,
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async getPipelineArtifacts(leadId: string): Promise<{
    pipelineReport?: ProspectPipelineReport;
    salesPackage?: SalesPackageContent;
  }> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const demo = await this.findLinkedDemo(lead);
    if (!demo) return {};

    const payload = (demo.payload as DemoPayload) ?? {};
    return {
      pipelineReport: payload._pipelineReport as
        | ProspectPipelineReport
        | undefined,
      salesPackage: payload._salesPackage as SalesPackageContent | undefined,
    };
  }

  async importBundleForLead(
    leadId: string,
    bundleInput: ProspectBundle,
    options?: { dryRun?: boolean; importedBy?: string },
  ): Promise<ImportReport & { demoType: 'prospect-package' }> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });

    const bundle: ProspectBundle = {
      ...bundleInput,
      prospect: {
        ...bundleInput.prospect,
        leadId: lead.id,
      },
    };

    const report = await this.prospectImporter.importBundle(bundle, {
      dryRun: options?.dryRun ?? false,
      frontendUrl: this.resolveFrontendUrl(),
      importedBy: options?.importedBy ?? 'lead-prospect-package',
    });

    if (!options?.dryRun && report.restaurantId) {
      await this.prisma.lead.update({
        where: { id: leadId },
        data: { demoExampleSlug: report.slug },
      });
      await this.stampImportMetadata(
        report.restaurantId,
        report,
        options?.importedBy,
      );
      this.logger.log(
        `Prospect package imported for lead ${leadId}: ${report.slug}`,
      );
    }

    return { ...report, demoType: 'prospect-package' };
  }

  assertValidBundle(bundle: unknown): asserts bundle is ProspectBundle {
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

  private async stampImportMetadata(
    demoExampleId: string,
    report: ImportReport,
    importedBy?: string,
  ) {
    const record = await this.prisma.demoExample.findUniqueOrThrow({
      where: { id: demoExampleId },
      select: { payload: true },
    });
    const payload = (record.payload as DemoPayload) ?? {};
    const importMeta: ProspectPackageImportMeta = {
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

  private async findLinkedDemo(lead: Lead) {
    const byLeadId = await this.prisma.demoExample.findFirst({
      where: { leadId: lead.id },
      orderBy: { updatedAt: 'desc' },
    });
    if (byLeadId) return byLeadId;

    if (lead.demoExampleSlug) {
      const bySlug = await this.prisma.demoExample.findUnique({
        where: { slug: lead.demoExampleSlug },
      });
      if (bySlug) return bySlug;
    }

    return null;
  }

  private isProspectPackagePayload(payload: DemoPayload): boolean {
    return Boolean(payload.prospect && typeof payload.prospect === 'object');
  }

  private resolveFrontendUrl(): string {
    return (
      this.config.get<string>('FRONTEND_URL') ??
      process.env.FRONTEND_URL ??
      'http://localhost:3000'
    ).replace(/\/$/, '');
  }
}
