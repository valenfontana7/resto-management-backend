import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { getCampaignById } from '../catalog/campaign-catalog.loader';

@Injectable()
export class CampaignOverrideService {
  constructor(private readonly prisma: PrismaService) {}

  async isPaused(campaignId: string): Promise<boolean> {
    const row = await this.prisma.lifecycleCampaignOverride.findUnique({
      where: { campaignId },
      select: { paused: true },
    });
    return row?.paused === true;
  }

  async getPausedMap(campaignIds: string[]): Promise<Map<string, boolean>> {
    if (campaignIds.length === 0) return new Map();
    const rows = await this.prisma.lifecycleCampaignOverride.findMany({
      where: { campaignId: { in: campaignIds } },
      select: { campaignId: true, paused: true },
    });
    return new Map(rows.map((r) => [r.campaignId, r.paused]));
  }

  async setPaused(
    campaignId: string,
    paused: boolean,
    updatedBy?: string,
  ): Promise<{ campaignId: string; paused: boolean; updatedAt: string }> {
    if (!getCampaignById(campaignId)) {
      throw new NotFoundException(
        `Campaña ${campaignId} no existe en el catálogo`,
      );
    }

    const row = await this.prisma.lifecycleCampaignOverride.upsert({
      where: { campaignId },
      create: {
        campaignId,
        paused,
        updatedBy: updatedBy ?? null,
      },
      update: {
        paused,
        updatedBy: updatedBy ?? null,
      },
    });

    if (paused) {
      await this.prisma.lifecycleActiveCampaign.updateMany({
        where: { campaignId, status: 'ACTIVE' },
        data: { status: 'CANCELLED', completedAt: new Date() },
      });
      await this.prisma.lifecycleDelivery.updateMany({
        where: {
          campaignId,
          status: { in: ['SCHEDULED', 'QUEUED'] },
        },
        data: {
          status: 'CANCELLED',
          errorMessage: 'Campaña pausada desde Marketing Hub',
        },
      });
    }

    return {
      campaignId: row.campaignId,
      paused: row.paused,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
