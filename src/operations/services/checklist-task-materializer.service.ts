import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  CoordinationType,
  CoordinationPriority,
  OperationShiftStatus,
  Prisma,
  ReservationStatus,
  TableSessionStatus,
} from '@prisma/client';
import { BusinessEventBusService } from '../../business-events/business-event-bus.service';
import { BentooBusinessEventType } from '../../business-events/types/event-type.enum';
import type {
  BentooBusinessEvent,
  BusinessEventSubscriber,
} from '../../business-events/types/business-event.types';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CLOSING_CHECKLIST_IDS,
  OPENING_CHECKLIST_IDS,
} from '../../floor/dto/daily-operation.dto';
import { CoordinationService } from './coordination.service';
import {
  CHECKLIST_TASK_CATALOG,
  checklistDedupeKey,
  parseChecklistItemIdFromDedupeKey,
  resolveChecklistParticipant,
  type ChecklistPhase,
  type ChecklistTaskDef,
} from '../utils/checklist-task.catalog';
import type { ShiftAssignment } from '../types/operations.types';

type SkipContext = {
  reservationsToday: number;
  reservationsTomorrow: number;
  lowStockCount: number;
  openTableSessions: number;
  cashDifferenceToday: number;
  experienceSegment: string;
  now: Date;
  doneItems: Set<string>;
};

/**
 * Materializa ítems de checklist DailyOperation como TASKs en La Línea.
 * Escucha ShiftOpened / ShiftClosingStarted; sync reverse al resolver TASK.
 */
@Injectable()
export class ChecklistTaskMaterializerService
  implements OnModuleInit, BusinessEventSubscriber
{
  readonly id = 'operations-checklist-task-materializer';
  readonly eventTypes = [
    BentooBusinessEventType.ShiftOpened,
    BentooBusinessEventType.ShiftClosingStarted,
    BentooBusinessEventType.CoordinationCompleted,
  ] as const;

  private readonly logger = new Logger(ChecklistTaskMaterializerService.name);

  constructor(
    private readonly bus: BusinessEventBusService,
    private readonly prisma: PrismaService,
    private readonly coordinations: CoordinationService,
  ) {}

  onModuleInit(): void {
    this.bus.registerSubscriber(this);
  }

  async handle(event: BentooBusinessEvent): Promise<void> {
    try {
      if (event.eventType === BentooBusinessEventType.ShiftOpened) {
        const payload = event.payload as { shiftId?: string };
        if (!payload.shiftId) return;
        await this.materialize(event.restaurantId, payload.shiftId, 'opening');
        return;
      }
      if (event.eventType === BentooBusinessEventType.ShiftClosingStarted) {
        const payload = event.payload as { shiftId?: string };
        if (!payload.shiftId) return;
        await this.materialize(event.restaurantId, payload.shiftId, 'closing');
        return;
      }
      if (event.eventType === BentooBusinessEventType.CoordinationCompleted) {
        await this.onCoordinationCompleted(event);
      }
    } catch (error) {
      this.logger.warn(
        `Checklist materializer failed for ${event.eventType}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async materializeOpening(
    restaurantId: string,
    shiftId: string,
  ): Promise<number> {
    return this.materialize(restaurantId, shiftId, 'opening');
  }

  async materializeClosing(
    restaurantId: string,
    shiftId: string,
  ): Promise<number> {
    return this.materialize(restaurantId, shiftId, 'closing');
  }

  private async materialize(
    restaurantId: string,
    shiftId: string,
    phase: ChecklistPhase,
  ): Promise<number> {
    const shift = await this.prisma.operationShift.findFirst({
      where: { id: shiftId, restaurantId },
    });
    if (!shift) return 0;
    if (
      shift.status !== OperationShiftStatus.OPEN &&
      shift.status !== OperationShiftStatus.CLOSING
    ) {
      return 0;
    }

    const roster = Array.isArray(shift.assignments)
      ? (shift.assignments as unknown as ShiftAssignment[])
      : [];

    const ctx = await this.buildSkipContext(
      restaurantId,
      shift.businessDate,
      shift.dailyOperationId,
      phase,
    );

    const defs = CHECKLIST_TASK_CATALOG.filter((d) => d.phase === phase).filter(
      (d) => !this.shouldSkip(d, ctx),
    );

    const dailyOpId = shift.dailyOperationId;
    let created = 0;

    for (const def of defs) {
      const participant = resolveChecklistParticipant(def, roster);
      const result = await this.coordinations.createFromPolicy({
        restaurantId,
        shiftId,
        type: CoordinationType.TASK,
        priority:
          def.priority === 'HIGH'
            ? CoordinationPriority.HIGH
            : CoordinationPriority.NORMAL,
        title: def.title,
        description: def.description,
        contextRef: {
          type: 'DAILY_OPERATION',
          id: dailyOpId ?? `checklist:${def.id}`,
          label: def.title,
          deepLink: def.deepLink,
        },
        origin: {
          kind: 'EVENT',
          sourceEventType:
            phase === 'opening' ? 'ShiftOpened' : 'ShiftClosingStarted',
        },
        participants: [participant],
        policyDedupeKey: checklistDedupeKey(shiftId, def.id),
        ackDeadlineMinutes: phase === 'opening' ? 30 : 20,
      });
      if (!result.deduped) created += 1;
    }

    if (created > 0) {
      this.logger.debug(
        `Materialized ${created} ${phase} checklist TASK(s) for shift ${shiftId}`,
      );
    }
    return created;
  }

  private async onCoordinationCompleted(
    event: BentooBusinessEvent,
  ): Promise<void> {
    const payload = event.payload as {
      coordinationId?: string;
      outcome?: string;
    };
    if (!payload.coordinationId || payload.outcome !== 'RESOLVED') return;

    const coord = await this.prisma.coordination.findFirst({
      where: {
        id: payload.coordinationId,
        restaurantId: event.restaurantId,
      },
      select: {
        policyDedupeKey: true,
        shiftId: true,
        type: true,
      },
    });
    if (!coord || coord.type !== CoordinationType.TASK) return;

    const itemId = parseChecklistItemIdFromDedupeKey(coord.policyDedupeKey);
    if (!itemId) return;

    const shift = await this.prisma.operationShift.findFirst({
      where: { id: coord.shiftId, restaurantId: event.restaurantId },
      select: { dailyOperationId: true },
    });
    if (!shift?.dailyOperationId) return;

    await this.markChecklistItem(shift.dailyOperationId, itemId);
  }

  private async markChecklistItem(
    dailyOperationId: string,
    itemId: string,
  ): Promise<void> {
    const isOpening = (OPENING_CHECKLIST_IDS as readonly string[]).includes(
      itemId,
    );
    const isClosing = (CLOSING_CHECKLIST_IDS as readonly string[]).includes(
      itemId,
    );
    if (!isOpening && !isClosing) return;

    const record = await this.prisma.dailyOperation.findUnique({
      where: { id: dailyOperationId },
    });
    if (!record) return;

    if (isOpening) {
      const checklist = this.asBoolMap(record.openingChecklist);
      if (checklist[itemId]) return;
      checklist[itemId] = true;
      const complete = OPENING_CHECKLIST_IDS.every((id) => checklist[id]);
      await this.prisma.dailyOperation.update({
        where: { id: dailyOperationId },
        data: {
          openingChecklist: checklist as Prisma.InputJsonValue,
          openingCompletedAt: complete
            ? (record.openingCompletedAt ?? new Date())
            : record.openingCompletedAt,
        },
      });
      return;
    }

    const checklist = this.asBoolMap(record.closingChecklist);
    if (checklist[itemId]) return;
    checklist[itemId] = true;
    const complete = CLOSING_CHECKLIST_IDS.every((id) => checklist[id]);
    await this.prisma.dailyOperation.update({
      where: { id: dailyOperationId },
      data: {
        closingChecklist: checklist as Prisma.InputJsonValue,
        closingCompletedAt: complete
          ? (record.closingCompletedAt ?? new Date())
          : record.closingCompletedAt,
      },
    });
  }

  private shouldSkip(def: ChecklistTaskDef, ctx: SkipContext): boolean {
    if (ctx.doneItems.has(def.id)) return true;

    const segment = ctx.experienceSegment;
    const day = ctx.now.getDay();

    switch (def.id) {
      case 'open_cash':
        return segment === 'counter-pickup';
      case 'review_reservations':
        return ctx.reservationsToday === 0;
      case 'verify_menu':
        return ctx.lowStockCount === 0;
      case 'briefing_team':
        return day === 0 || day === 1;
      case 'close_tables':
        return ctx.openTableSessions === 0 || segment === 'counter-pickup';
      case 'tomorrow_prep':
        return ctx.reservationsTomorrow === 0;
      case 'cash_count':
      case 'close_cash':
        return segment === 'counter-pickup' && ctx.cashDifferenceToday === 0;
      default:
        return false;
    }
  }

  private async buildSkipContext(
    restaurantId: string,
    businessDate: Date,
    dailyOperationId: string | null,
    phase: ChecklistPhase,
  ): Promise<SkipContext> {
    const dateKey = businessDate.toISOString().slice(0, 10);
    const start = new Date(`${dateKey}T00:00:00.000Z`);
    const end = new Date(`${dateKey}T23:59:59.999Z`);
    const tomorrowStart = new Date(start);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const tomorrowEnd = new Date(end);
    tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 1);

    const [
      reservationsToday,
      reservationsTomorrow,
      inventory,
      openTables,
      restaurant,
      dailyOp,
    ] = await Promise.all([
      this.prisma.reservation.count({
        where: {
          restaurantId,
          date: { gte: start, lte: end },
          status: {
            notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
          },
        },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          date: { gte: tomorrowStart, lte: tomorrowEnd },
          status: {
            notIn: [ReservationStatus.CANCELLED, ReservationStatus.NO_SHOW],
          },
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: { restaurantId },
        select: { currentStock: true, minStock: true },
        take: 200,
      }),
      this.prisma.tableSession.count({
        where: {
          restaurantId,
          status: TableSessionStatus.OPEN,
        },
      }),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { features: true, businessRules: true },
      }),
      dailyOperationId
        ? this.prisma.dailyOperation.findUnique({
            where: { id: dailyOperationId },
            select: { openingChecklist: true, closingChecklist: true },
          })
        : Promise.resolve(null),
    ]);

    const lowStockCount = inventory.filter(
      (i) => i.currentStock <= i.minStock,
    ).length;

    const doneItems = new Set<string>();
    if (dailyOp) {
      const map =
        phase === 'opening'
          ? this.asBoolMap(dailyOp.openingChecklist)
          : this.asBoolMap(dailyOp.closingChecklist);
      for (const [id, done] of Object.entries(map)) {
        if (done) doneItems.add(id);
      }
    }

    return {
      reservationsToday,
      reservationsTomorrow,
      lowStockCount,
      openTableSessions: openTables,
      cashDifferenceToday: 0,
      experienceSegment: this.resolveSegment(restaurant),
      now: new Date(),
      doneItems,
    };
  }

  private resolveSegment(
    restaurant: { features: unknown; businessRules: unknown } | null,
  ): string {
    const features =
      restaurant?.features &&
      typeof restaurant.features === 'object' &&
      !Array.isArray(restaurant.features)
        ? (restaurant.features as Record<string, unknown>)
        : {};

    if (features.delivery === true) return 'delivery-first';

    const hasReservations = features.reservations === true;
    const hasTakeaway =
      features.takeaway === true || features.onlineOrdering === true;
    if (!hasReservations && hasTakeaway) return 'counter-pickup';

    return 'full-service';
  }

  private asBoolMap(
    raw: Prisma.JsonValue | null | undefined,
  ): Record<string, boolean> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    return Object.fromEntries(
      Object.entries(raw as Record<string, unknown>).map(([k, v]) => [
        k,
        Boolean(v),
      ]),
    );
  }
}
