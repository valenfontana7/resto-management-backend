import { Injectable } from '@nestjs/common';
import { Lead } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildPresenceFromLead,
  buildTagsFromLead,
  computeIntentScore,
  computePriorityScore,
  defaultNextAction,
  defaultNextActionDue,
  defaultSignalSummary,
  mapLeadStatusToCommercialStage,
} from './commercial-relation.mapper';

@Injectable()
export class LeadRevenueSyncService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureForLead(leadId: string): Promise<void> {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;
    await this.syncFromLead(lead);
  }

  async syncFromLead(lead: Lead) {
    const stage = mapLeadStatusToCommercialStage(lead.status);
    const intentScore = computeIntentScore(lead);
    const opportunityScore = lead.score;
    const priorityScore = computePriorityScore(intentScore, opportunityScore);
    const nextActionDue = defaultNextActionDue();
    const isOverdue = nextActionDue.getTime() < Date.now();
    const tags = buildTagsFromLead(lead, intentScore, isOverdue);

    const payload = {
      name: lead.businessName.trim(),
      stage,
      convertedRestaurantId: lead.convertedRestaurantId,
      opportunityScore,
      intentScore,
      priorityScore,
      neighborhood: lead.city,
      localType: lead.category,
      branches: lead.branchCount,
      presence: buildPresenceFromLead(lead),
      tags,
      ownerId: lead.createdById,
      signalSummary: defaultSignalSummary(lead, stage),
    };

    const existing = await this.prisma.commercialRelation.findUnique({
      where: { leadId: lead.id },
    });

    if (existing) {
      return this.prisma.commercialRelation.update({
        where: { id: existing.id },
        data: {
          ...payload,
          nextAction: existing.nextAction ?? defaultNextAction(stage),
          nextActionDue: existing.nextActionDue ?? nextActionDue,
        },
      });
    }

    return this.prisma.commercialRelation.create({
      data: {
        leadId: lead.id,
        ...payload,
        nextAction: defaultNextAction(stage),
        nextActionDue,
      },
    });
  }

  async syncAllMissing(): Promise<{ created: number; total: number }> {
    const leadsWithoutRelation = await this.prisma.lead.findMany({
      where: { commercialRelation: null },
      select: { id: true },
    });

    for (const { id } of leadsWithoutRelation) {
      await this.ensureForLead(id);
    }

    const total = await this.prisma.commercialRelation.count();
    return { created: leadsWithoutRelation.length, total };
  }
}
