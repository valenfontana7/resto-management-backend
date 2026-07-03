import { Injectable, Logger } from '@nestjs/common';
import { LeadStatus } from '@prisma/client';
import { CommercialReactiveSensingHandler } from '../commercial-intelligence/events/commercial-reactive-sensing.handler';
import { PrismaService } from '../prisma/prisma.service';

export type RecordLeadDemoViewResult = {
  recorded: boolean;
  leadId?: string;
};

@Injectable()
export class LeadDemoViewService {
  private readonly logger = new Logger(LeadDemoViewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reactiveSensing: CommercialReactiveSensingHandler,
  ) {}

  async recordView(rawSlug: string): Promise<RecordLeadDemoViewResult> {
    const slug = rawSlug.trim().toLowerCase();
    if (!slug) {
      return { recorded: false };
    }

    const example = await this.prisma.demoExample.findUnique({
      where: { slug },
      select: { payload: true },
    });

    if (!example) {
      return { recorded: false };
    }

    const payload = example.payload as Record<string, unknown> | null;
    const leadId = typeof payload?.leadId === 'string' ? payload.leadId : null;
    if (!leadId) {
      return { recorded: false };
    }

    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        businessName: true,
        status: true,
        demoFirstViewedAt: true,
        demoViewCount: true,
      },
    });

    if (!lead) {
      return { recorded: false };
    }

    if (lead.status === LeadStatus.CLIENT || lead.status === LeadStatus.LOST) {
      return { recorded: false, leadId: lead.id };
    }

    const now = new Date();
    const isFirstView = lead.demoViewCount === 0 && !lead.demoFirstViewedAt;

    const updated = await this.prisma.lead.update({
      where: { id: lead.id },
      data: {
        demoLastViewedAt: now,
        demoFirstViewedAt: lead.demoFirstViewedAt ?? now,
        demoViewCount: { increment: 1 },
      },
      select: {
        id: true,
        businessName: true,
        demoViewCount: true,
        demoLastViewedAt: true,
      },
    });

    if (!updated.demoLastViewedAt) {
      return { recorded: false, leadId: updated.id };
    }

    this.reactiveSensing.onDemoViewed({
      leadId: updated.id,
      businessName: updated.businessName,
      viewCount: updated.demoViewCount,
      viewedAt: updated.demoLastViewedAt,
      isFirstView,
    });

    this.logger.log(
      `Lead demo view recorded: ${slug} → ${updated.id} (#${updated.demoViewCount})`,
    );

    return { recorded: true, leadId: updated.id };
  }
}
