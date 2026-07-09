import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CashRegisterSessionStatus,
  CoordinationType,
  HandoffStatus,
  OperationShiftStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { BusinessEventPublisherService } from '../../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import { ShiftService } from './shift.service';
import { ResolutionMemoryService } from './resolution-memory.service';
import { AcceptHandoffDto, PublishHandoffDto } from '../dto/operations.dto';
import type { HandoffSection } from '../types/operations.types';
import { ACTIVE_COORDINATION_STATUSES } from '../types/operations.types';

type SectionAck = {
  kind: string;
  ackedAt: string;
  byUserId: string;
};

@Injectable()
export class HandoffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly businessEvents: BusinessEventPublisherService,
    private readonly shifts: ShiftService,
    private readonly resolutionMemory: ResolutionMemoryService,
  ) {}

  async getPending(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const handoff = await this.prisma.handoff.findFirst({
      where: { restaurantId, status: HandoffStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });
    return { handoff: handoff ? this.serialize(handoff) : null };
  }

  async preview(restaurantId: string, userId: string, shiftId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.shifts.requireShift(restaurantId, shiftId);

    const { sections, openCoordIds } = await this.buildSections(
      restaurantId,
      shiftId,
      [],
    );

    return {
      preview: {
        fromShiftId: shiftId,
        sections,
        transferredCoordinationIds: openCoordIds,
      },
    };
  }

  async publish(
    restaurantId: string,
    userId: string,
    shiftId: string,
    dto: PublishHandoffDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const shift = await this.shifts.requireShift(restaurantId, shiftId);

    if (
      shift.status !== OperationShiftStatus.CLOSING &&
      shift.status !== OperationShiftStatus.OPEN &&
      shift.status !== OperationShiftStatus.CLOSED
    ) {
      throw new BadRequestException(
        'Solo se puede publicar handoff desde un turno en cierre o cerrado',
      );
    }

    const { sections, openCoordIds } = await this.buildSections(
      restaurantId,
      shiftId,
      dto.notes ?? [],
    );

    const transferIds = dto.transferredCoordinationIds ?? openCoordIds;

    // Recalculate OPEN_COORDINATIONS filtered by transfer selection
    const openSection = sections.find((s) => s.kind === 'OPEN_COORDINATIONS');
    if (openSection) {
      const items =
        (openSection.payload.items as Array<{ coordinationId: string }>) ?? [];
      openSection.payload.items = items.filter((i) =>
        transferIds.includes(i.coordinationId),
      );
    }

    await this.prisma.handoff.updateMany({
      where: {
        restaurantId,
        fromShiftId: shiftId,
        status: { in: [HandoffStatus.DRAFT, HandoffStatus.PUBLISHED] },
      },
      data: { status: HandoffStatus.SUPERSEDED },
    });

    const handoff = await this.prisma.handoff.create({
      data: {
        restaurantId,
        fromShiftId: shiftId,
        status: HandoffStatus.PUBLISHED,
        sections: sections as unknown as Prisma.InputJsonValue,
        transferredCoordinationIds: transferIds,
        sectionAcks: [],
        publishedAt: new Date(),
        publishedByUserId: userId,
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.HandoffPublished,
      restaurantId,
      source: 'operations.handoff',
      correlationId: `handoff-published:${handoff.id}`,
      payload: {
        handoffId: handoff.id,
        fromShiftId: shiftId,
        sectionCount: sections.length,
        openCoordinationCount: transferIds.length,
      },
    });

    return { handoff: this.serialize(handoff) };
  }

  async accept(
    restaurantId: string,
    userId: string,
    handoffId: string,
    dto: AcceptHandoffDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const handoff = await this.prisma.handoff.findFirst({
      where: { id: handoffId, restaurantId },
    });
    if (!handoff) throw new NotFoundException('Handoff no encontrado');
    if (handoff.status !== HandoffStatus.PUBLISHED) {
      throw new BadRequestException(
        'El handoff no está pendiente de aceptación',
      );
    }

    let toShiftId = dto.toShiftId;
    if (!toShiftId) {
      const current = await this.shifts.requireOpenShift(restaurantId);
      toShiftId = current.id;
    } else {
      await this.shifts.requireShift(restaurantId, toShiftId);
    }

    const transferIds = Array.isArray(handoff.transferredCoordinationIds)
      ? (handoff.transferredCoordinationIds as string[])
      : [];

    if (transferIds.length > 0) {
      await this.prisma.coordination.updateMany({
        where: {
          restaurantId,
          id: { in: transferIds },
          status: { in: [...ACTIVE_COORDINATION_STATUSES] },
        },
        data: { shiftId: toShiftId },
      });
    }

    const sections = Array.isArray(handoff.sections)
      ? (handoff.sections as unknown as HandoffSection[])
      : [];
    const requiredKinds = sections
      .filter((s) => s.requiredAck)
      .map((s) => s.kind);
    const ackKinds = dto.acknowledgedSectionKinds?.length
      ? dto.acknowledgedSectionKinds
      : requiredKinds;
    const now = new Date().toISOString();
    const sectionAcks: SectionAck[] = ackKinds.map((kind) => ({
      kind,
      ackedAt: now,
      byUserId: userId,
    }));

    const updated = await this.prisma.handoff.update({
      where: { id: handoff.id },
      data: {
        status: HandoffStatus.ACCEPTED,
        toShiftId,
        acceptedAt: new Date(),
        acceptedByUserId: userId,
        sectionAcks: sectionAcks as unknown as Prisma.InputJsonValue,
      },
    });

    void this.businessEvents.publish({
      eventType: BentooBusinessEventType.HandoffAccepted,
      restaurantId,
      source: 'operations.handoff',
      correlationId: `handoff-accepted:${handoff.id}`,
      payload: {
        handoffId: handoff.id,
        toShiftId,
        acceptedByUserId: userId,
      },
    });

    return { handoff: this.serialize(updated) };
  }

  private async buildSections(
    restaurantId: string,
    shiftId: string,
    notes: string[],
  ): Promise<{ sections: HandoffSection[]; openCoordIds: string[] }> {
    const openCoords = await this.prisma.coordination.findMany({
      where: {
        restaurantId,
        shiftId,
        status: { in: [...ACTIVE_COORDINATION_STATUSES] },
      },
      orderBy: { priority: 'desc' },
    });

    const sections: HandoffSection[] = [
      {
        kind: 'OPEN_COORDINATIONS',
        title: 'Coordinaciones abiertas',
        requiredAck: true,
        payload: {
          items: openCoords.map((c) => ({
            coordinationId: c.id,
            type: c.type,
            title: c.title,
            priority: c.priority,
          })),
        },
      },
    ];

    const cash = await this.buildCashStatus(restaurantId);
    if (cash) sections.push(cash);

    const stock = await this.buildCriticalStock(restaurantId);
    if (stock) sections.push(stock);

    const recurring = await this.resolutionMemory.getRecurringPendings(
      restaurantId,
      5,
    );
    if (recurring.length > 0) {
      sections.push({
        kind: 'RECURRING_PENDINGS',
        title: 'Pendientes recurrentes',
        requiredAck: true,
        payload: {
          items: recurring.map((item) => ({
            memoryKey: item.memoryKey,
            title: item.title,
            summary: item.summary,
            occurrenceCount: item.occurrenceCount,
            category: item.category,
            lastSeenAt: item.lastSeenAt,
          })),
        },
      });
    }

    const incidents = openCoords.filter(
      (c) => c.type === CoordinationType.INCIDENT,
    );
    if (incidents.length > 0) {
      sections.push({
        kind: 'EQUIPMENT_ISSUES',
        title: 'Incidencias abiertas',
        requiredAck: true,
        payload: {
          items: incidents.map((c) => ({
            coordinationId: c.id,
            title: c.title,
            priority: c.priority,
            evidenceCount: Array.isArray(c.evidence)
              ? (c.evidence as unknown[]).length
              : 0,
          })),
        },
      });
    }

    sections.push({
      kind: 'NOTES',
      title: 'Notas',
      requiredAck: false,
      payload: {
        items: notes.length > 0 ? notes : ([] as string[]),
      },
    });

    return {
      sections,
      openCoordIds: openCoords.map((c) => c.id),
    };
  }

  private async buildCashStatus(
    restaurantId: string,
  ): Promise<HandoffSection | null> {
    const open = await this.prisma.cashRegisterSession.findFirst({
      where: {
        restaurantId,
        status: CashRegisterSessionStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });
    if (open) {
      return {
        kind: 'CASH_STATUS',
        title: 'Estado de caja',
        requiredAck: true,
        payload: {
          status: 'OPEN',
          sessionId: open.id,
          openedAt: open.openedAt?.toISOString?.() ?? open.openedAt,
          openingFloat: open.openingFloat ?? null,
        },
      };
    }

    const lastClosed = await this.prisma.cashRegisterSession.findFirst({
      where: {
        restaurantId,
        status: CashRegisterSessionStatus.CLOSED,
      },
      orderBy: { closedAt: 'desc' },
    });
    if (!lastClosed) return null;

    return {
      kind: 'CASH_STATUS',
      title: 'Estado de caja',
      requiredAck: true,
      payload: {
        status: 'CLOSED',
        sessionId: lastClosed.id,
        closedAt: lastClosed.closedAt?.toISOString?.() ?? lastClosed.closedAt,
        expectedCash: lastClosed.expectedCash ?? null,
        countedCash: lastClosed.countedCash ?? null,
        discrepancy: lastClosed.difference ?? null,
      },
    };
  }

  private async buildCriticalStock(
    restaurantId: string,
  ): Promise<HandoffSection | null> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        currentStock: true,
        minStock: true,
        unit: true,
      },
      take: 200,
    });
    const low = items.filter((i) => i.currentStock <= i.minStock);
    if (low.length === 0) return null;

    return {
      kind: 'CRITICAL_STOCK',
      title: 'Stock crítico',
      requiredAck: true,
      payload: {
        items: low.map((i) => ({
          inventoryItemId: i.id,
          name: i.name,
          currentStock: i.currentStock,
          minStock: i.minStock,
          unit: i.unit,
        })),
      },
    };
  }

  private serialize(handoff: {
    id: string;
    restaurantId: string;
    fromShiftId: string;
    toShiftId: string | null;
    status: HandoffStatus;
    sections: unknown;
    transferredCoordinationIds: unknown;
    sectionAcks?: unknown;
    publishedAt: Date | null;
    publishedByUserId: string | null;
    acceptedAt: Date | null;
    acceptedByUserId: string | null;
    createdAt: Date;
  }) {
    return {
      id: handoff.id,
      restaurantId: handoff.restaurantId,
      fromShiftId: handoff.fromShiftId,
      toShiftId: handoff.toShiftId,
      status: handoff.status,
      sections: handoff.sections,
      transferredCoordinationIds: handoff.transferredCoordinationIds,
      sectionAcks: handoff.sectionAcks ?? [],
      publishedAt: handoff.publishedAt?.toISOString() ?? null,
      publishedByUserId: handoff.publishedByUserId,
      acceptedAt: handoff.acceptedAt?.toISOString() ?? null,
      acceptedByUserId: handoff.acceptedByUserId,
      createdAt: handoff.createdAt.toISOString(),
    };
  }
}
