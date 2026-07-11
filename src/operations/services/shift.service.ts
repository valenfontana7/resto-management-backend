import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  OperationShiftSegment,
  OperationShiftStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { BusinessEventPublisherService } from '../../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import { OpenShiftDto, UpdateRosterDto } from '../dto/operations.dto';
import type { ShiftAssignment } from '../types/operations.types';
import { ACTIVE_COORDINATION_STATUSES } from '../types/operations.types';
import { ShiftRecapService } from './shift-recap.service';

function startOfBusinessDate(iso?: string): Date {
  if (iso) {
    const d = new Date(iso);
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
    );
  }
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function formatBusinessDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function asAssignments(value: unknown): ShiftAssignment[] {
  if (!Array.isArray(value)) return [];
  return value as ShiftAssignment[];
}

@Injectable()
export class ShiftService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly businessEvents: BusinessEventPublisherService,
    private readonly shiftRecap: ShiftRecapService,
  ) {}

  async getCurrent(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const shift = await this.prisma.operationShift.findFirst({
      where: {
        restaurantId,
        status: {
          in: [OperationShiftStatus.OPEN, OperationShiftStatus.CLOSING],
        },
      },
      orderBy: { openedAt: 'desc' },
    });

    if (!shift) return { shift: null };

    const activeCount = await this.prisma.coordination.count({
      where: {
        restaurantId,
        shiftId: shift.id,
        status: { in: [...ACTIVE_COORDINATION_STATUSES] },
      },
    });

    return {
      shift: this.serialize(shift, { activeCoordinationCount: activeCount }),
    };
  }

  async open(restaurantId: string, userId: string, dto: OpenShiftDto) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const existing = await this.prisma.operationShift.findFirst({
      where: {
        restaurantId,
        status: {
          in: [OperationShiftStatus.OPEN, OperationShiftStatus.CLOSING],
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        'Ya hay un turno abierto. Cerralo antes de abrir otro.',
      );
    }

    const businessDate = startOfBusinessDate(dto.businessDate);
    const segment = dto.segment ?? OperationShiftSegment.EVENING;

    const dailyOp = await this.prisma.dailyOperation.findUnique({
      where: {
        restaurantId_businessDate: { restaurantId, businessDate },
      },
    });

    const nowIso = new Date().toISOString();
    const assignments: ShiftAssignment[] = dto.assignments?.map((a) => ({
      userId: a.userId,
      roleCode: a.roleCode,
      stationId: a.stationId,
      responsibilities: (a.responsibilities ??
        []) as ShiftAssignment['responsibilities'],
      joinedAt: nowIso,
    })) ?? [
      {
        userId,
        roleCode: 'MANAGER',
        responsibilities: ['SHIFT_LEAD'],
        joinedAt: nowIso,
      },
    ];

    const hasLead = assignments.some((a) =>
      a.responsibilities.includes('SHIFT_LEAD'),
    );
    if (!hasLead) {
      assignments[0].responsibilities = [
        ...new Set([...assignments[0].responsibilities, 'SHIFT_LEAD']),
      ] as ShiftAssignment['responsibilities'];
    }

    if (dailyOp && !dailyOp.openingCompletedAt) {
      await this.prisma.dailyOperation.update({
        where: { id: dailyOp.id },
        data: { openingCompletedAt: new Date() },
      });
    }

    const shift = await this.prisma.operationShift.create({
      data: {
        restaurantId,
        businessDate,
        segment,
        label: dto.label ?? this.defaultLabel(segment),
        status: OperationShiftStatus.OPEN,
        assignments: assignments as unknown as Prisma.InputJsonValue,
        dailyOperationId: dailyOp?.id,
        openedAt: new Date(),
        openedByUserId: userId,
      },
    });

    const lead = assignments.find((a) =>
      a.responsibilities.includes('SHIFT_LEAD'),
    );

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.ShiftOpened,
      restaurantId,
      source: 'operations.shift',
      correlationId: `shift-opened:${shift.id}`,
      payload: {
        shiftId: shift.id,
        segment: shift.segment,
        shiftLeadUserId: lead?.userId ?? userId,
        rosterCount: assignments.length,
        businessDate: formatBusinessDate(businessDate),
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.ShiftLeadAssigned,
      restaurantId,
      source: 'operations.shift',
      correlationId: `shift-lead:${shift.id}:${lead?.userId ?? userId}`,
      payload: {
        shiftId: shift.id,
        userId: lead?.userId ?? userId,
      },
    });

    return { shift: this.serialize(shift) };
  }

  async updateRoster(
    restaurantId: string,
    userId: string,
    shiftId: string,
    dto: UpdateRosterDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.requireShift(restaurantId, shiftId);

    if (
      shift.status !== OperationShiftStatus.OPEN &&
      shift.status !== OperationShiftStatus.PLANNED
    ) {
      throw new BadRequestException(
        'Solo se puede editar el roster de un turno abierto o planificado',
      );
    }

    const previous = asAssignments(shift.assignments);
    const nowIso = new Date().toISOString();
    const next: ShiftAssignment[] = dto.assignments.map((a) => ({
      userId: a.userId,
      roleCode: a.roleCode,
      stationId: a.stationId,
      responsibilities: (a.responsibilities ??
        []) as ShiftAssignment['responsibilities'],
      joinedAt: previous.find((p) => p.userId === a.userId)?.joinedAt ?? nowIso,
    }));

    const updated = await this.prisma.operationShift.update({
      where: { id: shift.id },
      data: { assignments: next as unknown as Prisma.InputJsonValue },
    });

    const prevIds = new Set(previous.map((p) => p.userId));
    const nextIds = new Set(next.map((n) => n.userId));

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.ShiftRosterChanged,
      restaurantId,
      source: 'operations.shift',
      payload: {
        shiftId: shift.id,
        added: [...nextIds].filter((id) => !prevIds.has(id)),
        removed: [...prevIds].filter((id) => !nextIds.has(id)),
      },
    });

    return { shift: this.serialize(updated) };
  }

  async startClosing(restaurantId: string, userId: string, shiftId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.requireShift(restaurantId, shiftId);
    if (shift.status !== OperationShiftStatus.OPEN) {
      throw new BadRequestException('El turno no está abierto');
    }

    const updated = await this.prisma.operationShift.update({
      where: { id: shift.id },
      data: {
        status: OperationShiftStatus.CLOSING,
        closingStartedAt: new Date(),
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.ShiftClosingStarted,
      restaurantId,
      source: 'operations.shift',
      correlationId: `shift-closing:${shift.id}`,
      payload: {
        shiftId: shift.id,
        businessDate: formatBusinessDate(shift.businessDate),
      },
    });

    return { shift: this.serialize(updated) };
  }

  async close(restaurantId: string, userId: string, shiftId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.requireShift(restaurantId, shiftId);

    if (
      shift.status !== OperationShiftStatus.OPEN &&
      shift.status !== OperationShiftStatus.CLOSING
    ) {
      throw new BadRequestException('El turno ya está cerrado');
    }

    const active = await this.prisma.coordination.findMany({
      where: {
        restaurantId,
        shiftId: shift.id,
        status: { in: [...ACTIVE_COORDINATION_STATUSES] },
      },
      select: { id: true, priority: true, title: true },
    });

    const critical = active.filter((c) => c.priority === 'CRITICAL');
    const high = active.filter((c) => c.priority === 'HIGH');

    const publishedHandoff = await this.prisma.handoff.findFirst({
      where: {
        restaurantId,
        fromShiftId: shift.id,
        status: 'PUBLISHED',
      },
      orderBy: { publishedAt: 'desc' },
    });

    const transferIds = publishedHandoff
      ? Array.isArray(publishedHandoff.transferredCoordinationIds)
        ? (publishedHandoff.transferredCoordinationIds as string[])
        : []
      : [];

    const blockers: Array<{
      code: string;
      message: string;
      coordinationIds?: string[];
    }> = [];

    if (critical.length > 0) {
      const untransferred = critical.filter((c) => !transferIds.includes(c.id));
      if (!publishedHandoff) {
        blockers.push({
          code: 'HANDOFF_REQUIRED',
          message:
            'Hay coordinaciones CRITICAL abiertas: publicá un handoff antes de cerrar',
          coordinationIds: critical.map((c) => c.id),
        });
      } else if (untransferred.length > 0) {
        blockers.push({
          code: 'CRITICAL_OPEN',
          message:
            'Hay CRITICAL abiertas sin incluir en el handoff — transferilas o resolvelas',
          coordinationIds: untransferred.map((c) => c.id),
        });
      }
    } else if (high.length > 0 && !publishedHandoff) {
      blockers.push({
        code: 'HANDOFF_REQUIRED',
        message:
          'Hay coordinaciones HIGH abiertas: publicá un handoff antes de cerrar',
        coordinationIds: high.map((c) => c.id),
      });
    }

    if (blockers.length > 0) {
      throw new BadRequestException({
        message: blockers[0].message,
        code: blockers[0].code,
        blockers,
      });
    }

    const warnings: Array<{ code: string; message: string }> = [];
    const normalOpen = active.filter(
      (c) => c.priority === 'NORMAL' || c.priority === 'LOW',
    );
    if (normalOpen.length > 0) {
      warnings.push({
        code: 'OPEN_COORDINATIONS',
        message: `${normalOpen.length} coordinación(es) NORMAL/LOW quedan abiertas`,
      });
    }
    if (!this.getShiftLeadUserId(shift)) {
      warnings.push({
        code: 'NO_SHIFT_LEAD',
        message: 'El turno no tiene SHIFT_LEAD asignado',
      });
    }

    const coords = await this.prisma.coordination.findMany({
      where: { restaurantId, shiftId: shift.id },
    });

    const stats = {
      total: coords.length,
      resolved: coords.filter((c) => c.status === 'RESOLVED').length,
      expired: coords.filter((c) => c.status === 'EXPIRED').length,
      escalated: coords.filter((c) => c.escalatedToShiftLead).length,
      transferred: transferIds.length,
    };

    const openedAt = shift.openedAt ?? shift.createdAt;
    const closedAt = new Date();
    const durationMinutes = Math.round(
      (closedAt.getTime() - openedAt.getTime()) / 60000,
    );

    const updated = await this.prisma.operationShift.update({
      where: { id: shift.id },
      data: {
        status: OperationShiftStatus.CLOSED,
        closedAt,
        closedByUserId: userId,
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.ShiftClosed,
      restaurantId,
      source: 'operations.shift',
      correlationId: `shift-closed:${shift.id}`,
      payload: {
        shiftId: shift.id,
        durationMinutes,
        coordinationStats: stats,
      },
    });

    const learning = await this.shiftRecap.buildLearningRecap(
      restaurantId,
      shift.id,
      openedAt,
      closedAt,
    );

    return {
      shift: this.serialize(updated),
      warnings,
      recap: {
        durationMinutes,
        coordinationStats: stats,
        medianAckMinutes: null as number | null,
        learning,
      },
    };
  }

  async requireOpenShift(restaurantId: string) {
    const shift = await this.prisma.operationShift.findFirst({
      where: {
        restaurantId,
        status: {
          in: [OperationShiftStatus.OPEN, OperationShiftStatus.CLOSING],
        },
      },
      orderBy: { openedAt: 'desc' },
    });
    if (!shift) {
      throw new NotFoundException(
        'No hay un turno abierto. Abrí el turno antes de coordinar.',
      );
    }
    return shift;
  }

  async requireShift(restaurantId: string, shiftId: string) {
    const shift = await this.prisma.operationShift.findFirst({
      where: { id: shiftId, restaurantId },
    });
    if (!shift) throw new NotFoundException('Turno no encontrado');
    return shift;
  }

  getShiftLeadUserId(shift: { assignments: unknown }): string | null {
    const assignments = asAssignments(shift.assignments);
    return (
      assignments.find((a) => a.responsibilities.includes('SHIFT_LEAD'))
        ?.userId ?? null
    );
  }

  private defaultLabel(segment: OperationShiftSegment): string {
    switch (segment) {
      case OperationShiftSegment.MORNING:
        return 'Almuerzo';
      case OperationShiftSegment.AFTERNOON:
        return 'Merienda';
      case OperationShiftSegment.EVENING:
        return 'Cena';
      default:
        return 'Turno';
    }
  }

  private serialize(
    shift: {
      id: string;
      restaurantId: string;
      businessDate: Date;
      segment: OperationShiftSegment;
      label: string | null;
      status: OperationShiftStatus;
      assignments: unknown;
      dailyOperationId: string | null;
      openedAt: Date | null;
      openedByUserId: string | null;
      closingStartedAt: Date | null;
      closedAt: Date | null;
      closedByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    extra?: { activeCoordinationCount?: number },
  ) {
    const assignments = asAssignments(shift.assignments);
    return {
      id: shift.id,
      restaurantId: shift.restaurantId,
      businessDate: formatBusinessDate(shift.businessDate),
      segment: shift.segment,
      label: shift.label,
      status: shift.status,
      assignments,
      shiftLeadUserId: this.getShiftLeadUserId(shift),
      dailyOperationId: shift.dailyOperationId,
      openedAt: shift.openedAt?.toISOString() ?? null,
      openedByUserId: shift.openedByUserId,
      closingStartedAt: shift.closingStartedAt?.toISOString() ?? null,
      closedAt: shift.closedAt?.toISOString() ?? null,
      closedByUserId: shift.closedByUserId,
      createdAt: shift.createdAt.toISOString(),
      updatedAt: shift.updatedAt.toISOString(),
      activeCoordinationCount: extra?.activeCoordinationCount,
    };
  }
}
