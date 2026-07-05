import { Injectable, NotFoundException } from '@nestjs/common';
import { Lead, LeadStatus, Prisma } from '@prisma/client';
import { CommercialReactiveSensingHandler } from '../commercial-intelligence/events/commercial-reactive-sensing.handler';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { LeadFiltersDto } from './dto/lead-filters.dto';
import { LeadScoringService } from './lead-scoring.service';
import { LeadDemoProvisionService } from './lead-demo-provision.service';
import { LeadRevenueSyncService } from '../revenue/lead-revenue-sync.service';
import { withRevenueRelationId } from './lead-serializer';
import { getLeadPriority } from './lead-scoring.rules';
import {
  findLeadDuplicateMatch,
  normalizeInstagramHandle,
} from './leads-discovery.helpers';
import type {
  ImportLeadsResult,
  CheckImportDuplicatesResult,
} from './types/lead-discovery.types';
import type { CheckImportDuplicateItemDto } from './dto/check-import-duplicates.dto';

type LeadWithRelations = Lead & {
  analyses?: { id: string; type: string; content: unknown; createdAt: Date }[];
  statusHistory?: {
    id: string;
    fromStatus: LeadStatus | null;
    toStatus: LeadStatus;
    changedAt: Date;
    changedById: string | null;
  }[];
};

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scoring: LeadScoringService,
    private readonly reactiveSensing: CommercialReactiveSensingHandler,
    private readonly leadDemoProvision: LeadDemoProvisionService,
    private readonly leadRevenueSync: LeadRevenueSyncService,
  ) {}

  async findAll(filters: LeadFiltersDto) {
    const where = this.buildWhereClause(filters);
    const orderBy = this.buildOrderBy(filters);

    const data = await this.prisma.lead.findMany({
      where,
      orderBy,
    });

    return { data, meta: { total: data.length } };
  }

  async findOne(id: string): Promise<LeadWithRelations> {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        analyses: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          take: 50,
        },
        commercialRelation: { select: { id: true } },
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead ${id} no encontrado`);
    }

    return withRevenueRelationId(lead) as LeadWithRelations;
  }

  async create(dto: CreateLeadDto, userId?: string) {
    const score = this.scoring.computeScore({
      hasWebsite: dto.hasWebsite ?? false,
      hasOnlineMenu: dto.hasOnlineMenu ?? false,
      hasReservations: dto.hasReservations ?? false,
      hasWhatsapp: dto.hasWhatsapp ?? false,
      instagram: dto.instagram,
      branchCount: dto.branchCount ?? 1,
    });

    const created = await this.prisma.lead.create({
      data: {
        businessName: dto.businessName.trim(),
        category: dto.category?.trim() || null,
        contactName: dto.contactName?.trim() || null,
        email: dto.email?.trim() || null,
        phone: dto.phone?.trim() || null,
        whatsapp: dto.whatsapp?.trim() || null,
        instagram: normalizeInstagramHandle(dto.instagram) ?? null,
        website: dto.website?.trim() || null,
        city: dto.city?.trim() || null,
        notes: dto.notes?.trim() || null,
        hasWebsite: dto.hasWebsite ?? false,
        hasOnlineMenu: dto.hasOnlineMenu ?? false,
        hasReservations: dto.hasReservations ?? false,
        hasWhatsapp: dto.hasWhatsapp ?? false,
        hasEcommerce: dto.hasEcommerce ?? false,
        branchCount: dto.branchCount ?? 1,
        score,
        discoveredWithAi: dto.discoveredWithAi ?? false,
        discoverySessionId: dto.discoverySessionId?.trim() || null,
        discoverySourceUrl: dto.discoverySourceUrl?.trim() || null,
        createdById: userId,
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: LeadStatus.NEW,
            changedById: userId,
          },
        },
      },
    });

    await this.leadRevenueSync.syncFromLead(created).catch(() => undefined);

    return withRevenueRelationId({
      ...created,
      commercialRelation: null,
    });
  }

  async update(id: string, dto: UpdateLeadDto) {
    const existing = await this.findOne(id);

    const merged = {
      hasWebsite: dto.hasWebsite ?? existing.hasWebsite,
      hasOnlineMenu: dto.hasOnlineMenu ?? existing.hasOnlineMenu,
      hasReservations: dto.hasReservations ?? existing.hasReservations,
      hasWhatsapp: dto.hasWhatsapp ?? existing.hasWhatsapp,
      instagram:
        dto.instagram !== undefined ? dto.instagram : existing.instagram,
      branchCount: dto.branchCount ?? existing.branchCount,
    };

    const score = this.scoring.computeScore(merged);

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        ...(dto.businessName !== undefined && {
          businessName: dto.businessName.trim(),
        }),
        ...(dto.category !== undefined && {
          category: dto.category?.trim() || null,
        }),
        ...(dto.contactName !== undefined && {
          contactName: dto.contactName?.trim() || null,
        }),
        ...(dto.email !== undefined && { email: dto.email?.trim() || null }),
        ...(dto.phone !== undefined && { phone: dto.phone?.trim() || null }),
        ...(dto.whatsapp !== undefined && {
          whatsapp: dto.whatsapp?.trim() || null,
        }),
        ...(dto.instagram !== undefined && {
          instagram: normalizeInstagramHandle(dto.instagram) ?? null,
        }),
        ...(dto.website !== undefined && {
          website: dto.website?.trim() || null,
        }),
        ...(dto.city !== undefined && { city: dto.city?.trim() || null }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
        ...(dto.hasWebsite !== undefined && { hasWebsite: dto.hasWebsite }),
        ...(dto.hasOnlineMenu !== undefined && {
          hasOnlineMenu: dto.hasOnlineMenu,
        }),
        ...(dto.hasReservations !== undefined && {
          hasReservations: dto.hasReservations,
        }),
        ...(dto.hasWhatsapp !== undefined && { hasWhatsapp: dto.hasWhatsapp }),
        ...(dto.hasEcommerce !== undefined && {
          hasEcommerce: dto.hasEcommerce,
        }),
        ...(dto.branchCount !== undefined && { branchCount: dto.branchCount }),
        score,
      },
    });

    if (updated.demoExampleSlug) {
      await this.leadDemoProvision.syncDemoFromLead(id).catch(() => undefined);
    }

    await this.leadRevenueSync.syncFromLead(updated).catch(() => undefined);

    const relation = await this.prisma.commercialRelation.findUnique({
      where: { leadId: id },
      select: { id: true },
    });

    return withRevenueRelationId({ ...updated, commercialRelation: relation });
  }

  async generateDemoForLead(id: string) {
    const lead = await this.findOne(id);
    return this.leadDemoProvision.ensureDemoForLead(lead);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.lead.delete({ where: { id } });
    return { success: true };
  }

  async updateStatus(id: string, status: LeadStatus, userId?: string) {
    const existing = await this.findOne(id);

    if (existing.status === status) {
      return existing;
    }

    const updated = await this.prisma.lead.update({
      where: { id },
      data: {
        status,
        statusHistory: {
          create: {
            fromStatus: existing.status,
            toStatus: status,
            changedById: userId,
          },
        },
      },
    });

    void this.reactiveSensing.onLeadStatusChanged(id, status);

    await this.leadRevenueSync.syncFromLead(updated).catch(() => undefined);

    const relation = await this.prisma.commercialRelation.findUnique({
      where: { leadId: id },
      select: { id: true },
    });

    return withRevenueRelationId({ ...updated, commercialRelation: relation });
  }

  async getDashboardStats() {
    const [total, newLeads, contacted, meetings, clients, lost, byStatus] =
      await Promise.all([
        this.prisma.lead.count(),
        this.prisma.lead.count({ where: { status: LeadStatus.NEW } }),
        this.prisma.lead.count({ where: { status: LeadStatus.CONTACTED } }),
        this.prisma.lead.count({
          where: { status: LeadStatus.MEETING_SCHEDULED },
        }),
        this.prisma.lead.count({ where: { status: LeadStatus.CLIENT } }),
        this.prisma.lead.count({ where: { status: LeadStatus.LOST } }),
        this.prisma.lead.groupBy({
          by: ['status'],
          _count: { id: true },
        }),
      ]);

    const conversionRate =
      total > 0 ? Math.round((clients / total) * 1000) / 10 : 0;

    return {
      total,
      newLeads,
      contacted,
      meetings,
      clients,
      lost,
      conversionRate,
      byStatus: byStatus.map((row) => ({
        status: row.status,
        count: row._count.id,
      })),
    };
  }

  async getAnalyticsStats() {
    const [clients, lost, byCategory, monthlyRaw, statusChanges] =
      await Promise.all([
        this.prisma.lead.count({ where: { status: LeadStatus.CLIENT } }),
        this.prisma.lead.count({ where: { status: LeadStatus.LOST } }),
        this.prisma.lead.groupBy({
          by: ['category'],
          _count: { id: true },
          where: { category: { not: null } },
        }),
        this.prisma.$queryRaw<
          { month: string; created: bigint; converted: bigint }[]
        >`
          SELECT
            to_char(date_trunc('month', l."createdAt"), 'YYYY-MM') AS month,
            COUNT(*)::bigint AS created,
            COUNT(*) FILTER (WHERE l.status = 'CLIENT')::bigint AS converted
          FROM "Lead" l
          GROUP BY date_trunc('month', l."createdAt")
          ORDER BY month DESC
          LIMIT 12
        `,
        this.prisma.leadStatusChange.findMany({
          where: { toStatus: LeadStatus.CLIENT },
          include: { lead: { select: { createdAt: true } } },
        }),
      ]);

    const conversionByCategory = await Promise.all(
      byCategory.map(async (row) => {
        const categoryClients = await this.prisma.lead.count({
          where: {
            category: row.category,
            status: LeadStatus.CLIENT,
          },
        });
        const total = row._count.id;
        return {
          category: row.category ?? 'Sin categoría',
          total,
          clients: categoryClients,
          conversionRate:
            total > 0 ? Math.round((categoryClients / total) * 1000) / 10 : 0,
        };
      }),
    );

    let avgDaysToClose: number | null = null;
    if (statusChanges.length > 0) {
      const totalDays = statusChanges.reduce((sum, change) => {
        const ms = change.changedAt.getTime() - change.lead.createdAt.getTime();
        return sum + ms / (1000 * 60 * 60 * 24);
      }, 0);
      avgDaysToClose = Math.round((totalDays / statusChanges.length) * 10) / 10;
    }

    const conversionByMonth = monthlyRaw
      .map((row) => ({
        month: row.month,
        created: Number(row.created),
        converted: Number(row.converted),
        conversionRate:
          Number(row.created) > 0
            ? Math.round((Number(row.converted) / Number(row.created)) * 1000) /
              10
            : 0,
      }))
      .reverse();

    const categoryDistribution = byCategory.map((row) => ({
      category: row.category ?? 'Sin categoría',
      count: row._count.id,
    }));

    return {
      clients,
      lost,
      avgDaysToClose,
      conversionByMonth,
      conversionByCategory,
      categoryDistribution,
    };
  }

  async importCandidates(
    candidates: CreateLeadDto[],
    userId?: string,
  ): Promise<ImportLeadsResult> {
    const existing = [
      ...(await this.prisma.lead.findMany({
        select: { id: true, businessName: true, city: true },
      })),
    ];

    const created: Lead[] = [];
    const skipped: ImportLeadsResult['skipped'] = [];
    const batchRefs: {
      id: string;
      businessName: string;
      city: string | null;
    }[] = [];

    for (const dto of candidates) {
      const name = dto.businessName?.trim();
      if (!name) {
        skipped.push({
          businessName: dto.businessName || 'Sin nombre',
          city: dto.city,
          reason: 'invalid',
        });
        continue;
      }

      const match = findLeadDuplicateMatch(name, dto.city, [
        ...existing,
        ...batchRefs,
      ]);
      if (match) {
        skipped.push({
          businessName: name,
          city: dto.city,
          reason: match.matchType === 'fuzzy' ? 'fuzzy_duplicate' : 'duplicate',
        });
        continue;
      }

      const lead = await this.create({ ...dto, businessName: name }, userId);
      batchRefs.push({
        id: lead.id,
        businessName: lead.businessName,
        city: lead.city,
      });
      existing.push({
        id: lead.id,
        businessName: lead.businessName,
        city: lead.city,
      });
      created.push(lead);
    }

    return { created, skipped };
  }

  async checkImportDuplicates(
    candidates: CheckImportDuplicateItemDto[],
  ): Promise<CheckImportDuplicatesResult> {
    const existing = await this.prisma.lead.findMany({
      select: { id: true, businessName: true, city: true },
    });

    const items = candidates.map((candidate) => {
      const name = candidate.businessName?.trim();
      const match = name
        ? findLeadDuplicateMatch(name, candidate.city, existing)
        : null;
      return {
        id: candidate.id,
        businessName: name || candidate.businessName,
        city: candidate.city,
        isDuplicate: Boolean(match),
        existingLeadId: match?.id,
        matchType: match?.matchType,
        matchScore: match?.score,
      };
    });

    return { items };
  }

  private buildWhereClause(filters: LeadFiltersDto): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};

    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { businessName: { contains: q, mode: 'insensitive' } },
        { contactName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
        { category: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (filters.status) where.status = filters.status;
    if (filters.discoveredOnly) {
      where.AND = [
        ...(Array.isArray(where.AND)
          ? where.AND
          : where.AND
            ? [where.AND]
            : []),
        {
          OR: [
            { discoveredWithAi: true },
            {
              notes: { contains: 'Descubierto con IA', mode: 'insensitive' },
            },
          ],
        },
      ];
    }
    if (filters.category) {
      where.category = { equals: filters.category, mode: 'insensitive' };
    }
    if (filters.city) {
      where.city = { contains: filters.city, mode: 'insensitive' };
    }

    if (filters.priority) {
      const ranges: Record<string, { gte?: number; lte?: number }> = {
        low: { lte: 30 },
        medium: { gte: 31, lte: 60 },
        high: { gte: 61 },
      };
      const range = ranges[filters.priority];
      if (range) where.score = range;
    }

    if (filters.minScore !== undefined || filters.maxScore !== undefined) {
      where.score = {
        ...(where.score as Prisma.IntFilter | undefined),
        ...(filters.minScore !== undefined && { gte: filters.minScore }),
        ...(filters.maxScore !== undefined && { lte: filters.maxScore }),
      };
    }

    return where;
  }

  private buildOrderBy(
    filters: LeadFiltersDto,
  ): Prisma.LeadOrderByWithRelationInput {
    const sort = filters.sort ?? 'createdAt';
    const dir = filters.dir ?? 'desc';
    return { [sort]: dir };
  }
}

export { getLeadPriority };
