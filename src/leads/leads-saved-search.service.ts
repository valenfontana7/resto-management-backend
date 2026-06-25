import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSavedSearchDto,
  UpdateSavedSearchDto,
} from './dto/saved-search.dto';

type SavedSearchSchedule = 'manual' | 'daily' | 'weekly';

@Injectable()
export class LeadsSavedSearchService {
  private readonly logger = new Logger(LeadsSavedSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  list(userId?: string) {
    return this.prisma.leadSavedSearch.findMany({
      where: userId ? { createdById: userId } : undefined,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async create(dto: CreateSavedSearchDto, userId?: string) {
    const schedule = (dto.schedule ?? 'manual') as SavedSearchSchedule;
    return this.prisma.leadSavedSearch.create({
      data: {
        name: dto.name?.trim() || null,
        query: dto.query.trim(),
        filters: dto.filters as Prisma.InputJsonValue,
        schedule,
        enabled: dto.enabled ?? false,
        nextRunAt: this.computeNextRunAt(schedule),
        createdById: userId,
      },
    });
  }

  async update(id: string, dto: UpdateSavedSearchDto) {
    const existing = await this.findOne(id);
    const schedule = (dto.schedule ?? existing.schedule) as SavedSearchSchedule;
    const enabled = dto.enabled ?? existing.enabled;

    return this.prisma.leadSavedSearch.update({
      where: { id },
      data: {
        name: dto.name !== undefined ? dto.name?.trim() || null : undefined,
        query: dto.query?.trim(),
        filters:
          dto.filters !== undefined
            ? (dto.filters as Prisma.InputJsonValue)
            : undefined,
        schedule: dto.schedule,
        enabled: dto.enabled,
        nextRunAt:
          dto.schedule !== undefined || dto.enabled !== undefined
            ? enabled && schedule !== 'manual'
              ? this.computeNextRunAt(schedule)
              : null
            : undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.leadSavedSearch.delete({ where: { id } });
    return { success: true };
  }

  async findOne(id: string) {
    const row = await this.prisma.leadSavedSearch.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Búsqueda guardada no encontrada');
    return row;
  }

  async markRun(id: string) {
    const row = await this.findOne(id);
    const schedule = row.schedule as SavedSearchSchedule;
    const now = new Date();
    return this.prisma.leadSavedSearch.update({
      where: { id },
      data: {
        lastRunAt: now,
        nextRunAt:
          row.enabled && schedule !== 'manual'
            ? this.computeNextRunAt(schedule, now)
            : null,
      },
    });
  }

  findDue() {
    const now = new Date();
    return this.prisma.leadSavedSearch.findMany({
      where: {
        enabled: true,
        schedule: { in: ['daily', 'weekly'] },
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
      orderBy: { nextRunAt: 'asc' },
      take: 20,
    });
  }

  computeNextRunAt(
    schedule: SavedSearchSchedule,
    from = new Date(),
  ): Date | null {
    if (schedule === 'manual') return null;
    const next = new Date(from);
    next.setHours(7, 0, 0, 0);
    if (schedule === 'daily') {
      if (next <= from) next.setDate(next.getDate() + 1);
    } else if (schedule === 'weekly') {
      next.setDate(next.getDate() + 7);
    }
    return next;
  }
}
