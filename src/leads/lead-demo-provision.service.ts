import { Injectable, Logger } from '@nestjs/common';
import { Lead, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildLeadDemoAdminUrl,
  buildLeadDemoUrl,
  pickLeadDemoTemplateSlug,
  slugifyLeadDemoSlug,
} from './leads-ai.helpers';
import { getLeadDemoTemplatePayload } from './lead-demo-templates';

@Injectable()
export class LeadDemoProvisionService {
  private readonly logger = new Logger(LeadDemoProvisionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ensureDemoForLead(lead: Lead): Promise<{
    slug: string;
    demoUrl: string;
    adminDemoUrl: string;
  }> {
    const slug = slugifyLeadDemoSlug(lead.businessName);
    const demoUrl = buildLeadDemoUrl(
      process.env.FRONTEND_URL,
      lead.businessName,
    );
    const adminDemoUrl = buildLeadDemoAdminUrl(
      process.env.FRONTEND_URL,
      lead.businessName,
    );
    const templateSlug = pickLeadDemoTemplateSlug({
      category: lead.category,
      businessName: lead.businessName,
    });

    const templateRecord = await this.prisma.demoExample.findUnique({
      where: { slug: templateSlug },
    });

    const basePayload =
      (templateRecord?.payload as Record<string, unknown> | undefined) ??
      getLeadDemoTemplatePayload(templateSlug);

    const payload = this.personalizePayload(
      basePayload,
      lead,
      slug,
      templateSlug,
    );

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

    this.logger.log(
      `Lead demo provisioned: ${slug} (template ${templateSlug})`,
    );
    return { slug, demoUrl, adminDemoUrl };
  }

  private personalizePayload(
    base: Record<string, unknown>,
    lead: Lead,
    slug: string,
    templateSlug: string,
  ): Record<string, unknown> {
    const location =
      typeof base.location === 'object' && base.location
        ? { ...(base.location as Record<string, unknown>) }
        : {};

    if (lead.city?.trim()) {
      location.city = lead.city.trim();
    }

    return {
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
      },
      description:
        typeof base.description === 'string'
          ? base.description.replace(/^[^.]+\./, `${lead.businessName}.`)
          : `Demo Bentoo personalizada para ${lead.businessName}.`,
    };
  }
}
