import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Lead, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildLeadDemoAdminUrl,
  buildLeadDemoUrl,
  pickLeadDemoTemplateSlug,
  slugifyLeadDemoSlug,
  type LeadDemoTemplateSlug,
} from './leads-ai.helpers';
import { getLeadDemoTemplatePayload } from './lead-demo-templates';
import type { UpdateLeadDemoDto } from './dto/update-lead-demo.dto';

type DemoPayload = Record<string, unknown>;

@Injectable()
export class LeadDemoProvisionService {
  private readonly logger = new Logger(LeadDemoProvisionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureDemoForLead(lead: Lead): Promise<{
    slug: string;
    demoUrl: string;
    adminDemoUrl: string;
  }> {
    const existing = await this.findDemoRecordForLead(lead);
    if (existing) {
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { demoExampleSlug: existing.slug },
      });
      return {
        slug: existing.slug,
        demoUrl: buildLeadDemoUrl(process.env.FRONTEND_URL, lead.businessName),
        adminDemoUrl: buildLeadDemoAdminUrl(
          process.env.FRONTEND_URL,
          lead.businessName,
        ),
      };
    }

    const slug = slugifyLeadDemoSlug(lead.businessName);
    const templateSlug = pickLeadDemoTemplateSlug({
      category: lead.category,
      businessName: lead.businessName,
    });
    const basePayload = await this.loadTemplatePayload(templateSlug);
    const payload = this.personalizePayload(
      basePayload,
      lead,
      slug,
      templateSlug,
    );

    await this.upsertDemoRecord({
      slug,
      lead,
      payload,
      templateSlug,
    });

    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { demoExampleSlug: slug },
    });

    this.logger.log(
      `Lead demo provisioned: ${slug} (template ${templateSlug})`,
    );
    return {
      slug,
      demoUrl: buildLeadDemoUrl(process.env.FRONTEND_URL, lead.businessName),
      adminDemoUrl: buildLeadDemoAdminUrl(
        process.env.FRONTEND_URL,
        lead.businessName,
      ),
    };
  }

  async getDemoForLead(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const record = await this.findDemoRecordForLead(lead);
    if (!record) {
      throw new NotFoundException('Este prospecto no tiene demo generada');
    }

    const payload = record.payload as DemoPayload;
    return {
      leadId: lead.id,
      demoExampleId: record.id,
      slug: record.slug,
      name: record.name,
      type: record.type,
      cuisine: record.cuisine,
      city: record.city,
      neighborhood: record.neighborhood,
      isActive: record.isActive,
      payload,
      demoUrl: buildLeadDemoUrl(process.env.FRONTEND_URL, record.name),
      adminDemoUrl: buildLeadDemoAdminUrl(
        process.env.FRONTEND_URL,
        record.name,
      ),
      templateSlug: (payload.templateSlug as string | undefined) ?? null,
      menuCustomized: Boolean(payload.menuCustomized),
      menu: Array.isArray(payload.menu) ? payload.menu : null,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateDemoForLead(leadId: string, dto: UpdateLeadDemoDto) {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    let record = await this.findDemoRecordForLead(lead);
    if (!record) {
      await this.ensureDemoForLead(lead);
      record = await this.findDemoRecordForLead(lead);
    }
    if (!record) {
      throw new NotFoundException('No se pudo cargar la demo del prospecto');
    }

    const currentPayload = (record.payload as DemoPayload) ?? {};
    const nextPayload: DemoPayload = { ...currentPayload };

    if (dto.templateSlug) nextPayload.templateSlug = dto.templateSlug;
    if (dto.description != null) nextPayload.description = dto.description;
    if (dto.hours) nextPayload.hours = dto.hours;
    if (dto.menu) {
      nextPayload.menu = dto.menu;
      nextPayload.menuCustomized = dto.menuCustomized ?? true;
    } else if (dto.menuCustomized != null) {
      nextPayload.menuCustomized = dto.menuCustomized;
    }

    if (dto.website || dto.phone || dto.email) {
      nextPayload.contact = {
        ...(typeof currentPayload.contact === 'object' && currentPayload.contact
          ? (currentPayload.contact as Record<string, unknown>)
          : {}),
        ...(dto.website != null ? { website: dto.website } : {}),
        ...(dto.phone != null ? { phone: dto.phone } : {}),
        ...(dto.email != null ? { email: dto.email } : {}),
      };
    }

    if (dto.instagram || dto.whatsapp) {
      nextPayload.social = {
        ...(typeof currentPayload.social === 'object' && currentPayload.social
          ? (currentPayload.social as Record<string, unknown>)
          : {}),
        ...(dto.instagram != null ? { instagram: dto.instagram } : {}),
        ...(dto.whatsapp != null ? { whatsapp: dto.whatsapp } : {}),
      };
    }

    if (dto.name) {
      nextPayload.name = dto.name;
    }

    await this.prisma.demoExample.update({
      where: { id: record.id },
      data: {
        name: dto.name ?? record.name,
        type: dto.type ?? record.type,
        cuisine: dto.cuisine ?? record.cuisine,
        city: dto.city ?? record.city,
        neighborhood: dto.neighborhood ?? record.neighborhood,
        payload: nextPayload as Prisma.InputJsonValue,
      },
    });

    return this.getDemoForLead(leadId);
  }

  async syncDemoFromLead(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const record = await this.findDemoRecordForLead(lead);
    if (!record) return null;

    const payload = record.payload as DemoPayload;
    const templateSlug =
      (payload.templateSlug as string | undefined) ??
      pickLeadDemoTemplateSlug({
        category: lead.category,
        businessName: lead.businessName,
      });

    const merged = this.personalizePayload(
      payload,
      lead,
      record.slug,
      templateSlug,
      {
        preserveMenu: Boolean(payload.menuCustomized),
        existingMenu: Array.isArray(payload.menu) ? payload.menu : undefined,
      },
    );

    await this.prisma.demoExample.update({
      where: { id: record.id },
      data: {
        name: lead.businessName,
        city: lead.city?.trim() || record.city,
        payload: merged as Prisma.InputJsonValue,
      },
    });

    return this.getDemoForLead(leadId);
  }

  async regenerateDemoForLead(leadId: string) {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
    });
    const existing = await this.findDemoRecordForLead(lead);
    const preserveMenu =
      existing &&
      Boolean((existing.payload as DemoPayload)?.menuCustomized) &&
      Array.isArray((existing.payload as DemoPayload)?.menu);

    const templateSlug = pickLeadDemoTemplateSlug({
      category: lead.category,
      businessName: lead.businessName,
    });
    const basePayload = await this.loadTemplatePayload(templateSlug);
    const slug = existing?.slug ?? slugifyLeadDemoSlug(lead.businessName);

    const payload = this.personalizePayload(
      basePayload,
      lead,
      slug,
      templateSlug,
      preserveMenu
        ? {
            preserveMenu: true,
            existingMenu: (existing.payload as DemoPayload).menu as unknown[],
          }
        : undefined,
    );

    await this.upsertDemoRecord({ slug, lead, payload, templateSlug });
    await this.prisma.lead.update({
      where: { id: lead.id },
      data: { demoExampleSlug: slug },
    });

    return this.getDemoForLead(leadId);
  }

  private async findDemoRecordForLead(lead: Lead) {
    if (lead.demoExampleSlug) {
      const bySlug = await this.prisma.demoExample.findUnique({
        where: { slug: lead.demoExampleSlug },
      });
      if (bySlug) return bySlug;
    }

    const slug = slugifyLeadDemoSlug(lead.businessName);
    const byBusinessSlug = await this.prisma.demoExample.findUnique({
      where: { slug },
    });
    if (byBusinessSlug) return byBusinessSlug;

    const rows = await this.prisma.demoExample.findMany({
      where: { sortOrder: { gte: 9000 } },
      take: 200,
      orderBy: { updatedAt: 'desc' },
    });
    return (
      rows.find((row) => {
        const payload = row.payload as DemoPayload;
        return payload.leadId === lead.id;
      }) ?? null
    );
  }

  private async loadTemplatePayload(templateSlug: string) {
    const templateRecord = await this.prisma.demoExample.findUnique({
      where: { slug: templateSlug },
    });
    return (
      (templateRecord?.payload as Record<string, unknown> | undefined) ??
      getLeadDemoTemplatePayload(templateSlug as LeadDemoTemplateSlug)
    );
  }

  private async upsertDemoRecord(input: {
    slug: string;
    lead: Lead;
    payload: DemoPayload;
    templateSlug: string;
  }) {
    const { slug, lead, payload } = input;
    await this.prisma.demoExample.upsert({
      where: { slug },
      create: {
        slug,
        name: lead.businessName,
        type: (payload.type as string) ?? 'cafe',
        cuisine: Array.isArray(payload.cuisine)
          ? (payload.cuisine as string[])
          : lead.category
            ? [lead.category]
            : [],
        city:
          lead.city?.trim() ||
          (payload.location as { city?: string })?.city ||
          '',
        neighborhood:
          (payload.location as { neighborhood?: string })?.neighborhood || '',
        isActive: true,
        isFeatured: false,
        sortOrder: 9000,
        payload: payload as Prisma.InputJsonValue,
      },
      update: {
        name: lead.businessName,
        city: lead.city?.trim() || undefined,
        payload: payload as Prisma.InputJsonValue,
        isActive: true,
      },
    });
  }

  private personalizePayload(
    base: Record<string, unknown>,
    lead: Lead,
    slug: string,
    templateSlug: string,
    options?: {
      preserveMenu?: boolean;
      existingMenu?: unknown[];
    },
  ): Record<string, unknown> {
    const location =
      typeof base.location === 'object' && base.location
        ? { ...(base.location as Record<string, unknown>) }
        : {};

    if (lead.city?.trim()) {
      location.city = lead.city.trim();
    }

    const payload: Record<string, unknown> = {
      ...base,
      id: slug,
      slug,
      name: lead.businessName,
      templateSlug,
      leadId: lead.id,
      location,
      contact: {
        ...(typeof base.contact === 'object' && base.contact
          ? (base.contact as Record<string, unknown>)
          : {}),
        ...(lead.phone ? { phone: lead.phone } : {}),
        ...(lead.email ? { email: lead.email } : {}),
        ...(lead.website ? { website: lead.website } : {}),
      },
      social: {
        ...(typeof base.social === 'object' && base.social
          ? (base.social as Record<string, unknown>)
          : {}),
        ...(lead.instagram ? { instagram: lead.instagram } : {}),
        ...(lead.whatsapp ? { whatsapp: lead.whatsapp } : {}),
      },
      description:
        typeof base.description === 'string'
          ? base.description.replace(/^[^.]+\./, `${lead.businessName}.`)
          : `Demo Bentoo personalizada para ${lead.businessName}.`,
    };

    if (options?.preserveMenu && options.existingMenu) {
      payload.menu = options.existingMenu;
      payload.menuCustomized = true;
    }

    return payload;
  }
}
