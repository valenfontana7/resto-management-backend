import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import {
  CashRegisterSessionStatus,
  CashRegisterLevel,
  OrderStatus,
  Prisma,
  ReservationStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  CLOSING_CHECKLIST_IDS,
  OPENING_CHECKLIST_IDS,
  UpdateDailyOperationDto,
} from '../dto/daily-operation.dto';
import { CloseDailyOperationDto } from '../dto/close-daily-operation.dto';
import type {
  DailyCloseBlocker,
  DailyCloseReport,
} from '../types/daily-close-report.types';
import { resolveDailyCloseConfig } from '../utils/daily-close-config.util';
import { buildDailyCloseReport } from '../utils/daily-close-report.builder';
import { isSalonFloorOrder } from '../../orders/utils/order-channel.util';

function parseBusinessDate(dateStr?: string): Date {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new Date(`${dateStr}T12:00:00.000Z`);
  }
  const now = new Date();
  return new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate(), 12),
  );
}

function formatBusinessDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayBoundsUtc(businessDate: Date) {
  const dateKey = formatBusinessDate(businessDate);
  return {
    start: new Date(`${dateKey}T00:00:00.000Z`),
    end: new Date(`${dateKey}T23:59:59.999Z`),
  };
}

function normalizeChecklist(
  ids: readonly string[],
  raw: Prisma.JsonValue | null | undefined,
): Record<string, boolean> {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, boolean>)
      : {};
  return Object.fromEntries(ids.map((id) => [id, Boolean(source[id])]));
}

function isChecklistComplete(
  ids: readonly string[],
  checklist: Record<string, boolean>,
): boolean {
  return ids.every((id) => checklist[id]);
}

@Injectable()
export class DailyOperationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async getDailyOperation(
    restaurantId: string,
    userId: string,
    dateStr?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const businessDate = parseBusinessDate(dateStr);
    const record = await this.ensureRecord(restaurantId, businessDate);
    const summary = await this.buildSummary(restaurantId, businessDate);

    return {
      operation: this.formatOperation(record),
      summary,
    };
  }

  async updateDailyOperation(
    restaurantId: string,
    userId: string,
    dto: UpdateDailyOperationDto,
    dateStr?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const businessDate = parseBusinessDate(dateStr);
    const existing = await this.ensureRecord(restaurantId, businessDate);

    const openingChecklist = dto.openingChecklist
      ? normalizeChecklist(OPENING_CHECKLIST_IDS, dto.openingChecklist)
      : normalizeChecklist(OPENING_CHECKLIST_IDS, existing.openingChecklist);

    const closingChecklist = dto.closingChecklist
      ? normalizeChecklist(CLOSING_CHECKLIST_IDS, dto.closingChecklist)
      : normalizeChecklist(CLOSING_CHECKLIST_IDS, existing.closingChecklist);

    const openingComplete =
      dto.openingCompleted ??
      isChecklistComplete(OPENING_CHECKLIST_IDS, openingChecklist);
    const closingComplete =
      dto.closingCompleted ??
      isChecklistComplete(CLOSING_CHECKLIST_IDS, closingChecklist);

    const updated = await this.prisma.dailyOperation.update({
      where: { id: existing.id },
      data: {
        dailyGoal: dto.dailyGoal ?? existing.dailyGoal,
        openingChecklist,
        openingNotes: dto.openingNotes ?? existing.openingNotes,
        openingCompletedAt: openingComplete
          ? (existing.openingCompletedAt ?? new Date())
          : null,
        closingChecklist,
        closingNotes: dto.closingNotes ?? existing.closingNotes,
        closingCompletedAt: closingComplete
          ? (existing.closingCompletedAt ?? new Date())
          : null,
      },
    });

    const summary = await this.buildSummary(restaurantId, businessDate);

    return {
      operation: this.formatOperation(updated),
      summary,
    };
  }

  async closeDay(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: CloseDailyOperationDto,
    dateStr?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const businessDate = parseBusinessDate(dateStr);
    const record = await this.ensureRecord(restaurantId, businessDate);
    const blockers = await this.collectCloseBlockers(restaurantId, record);

    if (blockers.length > 0) {
      throw new BadRequestException({
        message: 'No se puede cerrar la caja diaria',
        blockers,
      });
    }

    const closedAt = new Date();
    const dailyCloseReport = await buildDailyCloseReport(this.prisma, {
      restaurantId,
      businessDate,
      closedAt,
      closedByName: userName,
      notes: dto.notes ?? record.closingNotes,
    });

    const closingChecklist = normalizeChecklist(
      CLOSING_CHECKLIST_IDS,
      record.closingChecklist,
    );

    const updated = await this.prisma.dailyOperation.update({
      where: { id: record.id },
      data: {
        dailyCloseReport: dailyCloseReport as unknown as Prisma.InputJsonValue,
        dailyClosedAt: closedAt,
        dailyClosedByName: userName,
        closingCompletedAt: record.closingCompletedAt ?? closedAt,
        closingChecklist,
      },
    });

    const summary = await this.buildSummary(restaurantId, businessDate);

    return {
      operation: this.formatOperation(updated),
      summary,
      dailyCloseReport,
    };
  }

  async getDailyCloseReport(
    restaurantId: string,
    userId: string,
    dateStr?: string,
  ): Promise<{ dailyCloseReport: DailyCloseReport }> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const businessDate = parseBusinessDate(dateStr);
    const record = await this.prisma.dailyOperation.findUnique({
      where: {
        restaurantId_businessDate: { restaurantId, businessDate },
      },
    });

    if (!record) {
      throw new NotFoundException('Operación del día no encontrada');
    }

    if (
      record.dailyCloseReport &&
      typeof record.dailyCloseReport === 'object' &&
      !Array.isArray(record.dailyCloseReport)
    ) {
      return {
        dailyCloseReport:
          record.dailyCloseReport as unknown as DailyCloseReport,
      };
    }

    if (!record.dailyClosedAt) {
      throw new BadRequestException('La caja diaria aún no está cerrada');
    }

    const dailyCloseReport = await buildDailyCloseReport(this.prisma, {
      restaurantId,
      businessDate,
      closedAt: record.dailyClosedAt,
      closedByName: record.dailyClosedByName ?? '—',
      notes: record.closingNotes,
    });

    return { dailyCloseReport };
  }

  private async ensureRecord(restaurantId: string, businessDate: Date) {
    const existing = await this.prisma.dailyOperation.findUnique({
      where: {
        restaurantId_businessDate: {
          restaurantId,
          businessDate,
        },
      },
    });

    if (existing) return existing;

    return this.prisma.dailyOperation.create({
      data: {
        restaurantId,
        businessDate,
        openingChecklist: Object.fromEntries(
          OPENING_CHECKLIST_IDS.map((id) => [id, false]),
        ),
        closingChecklist: Object.fromEntries(
          CLOSING_CHECKLIST_IDS.map((id) => [id, false]),
        ),
      },
    });
  }

  private async buildSummary(restaurantId: string, businessDate: Date) {
    const { start, end } = dayBoundsUtc(businessDate);
    const yesterday = new Date(businessDate);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const yesterdayBounds = dayBoundsUtc(yesterday);

    const operationRecord = await this.prisma.dailyOperation.findUnique({
      where: {
        restaurantId_businessDate: { restaurantId, businessDate },
      },
    });

    const [
      todayOrders,
      todayRevenue,
      pendingReservations,
      openTableSessions,
      openCashRegister,
      lastClosedCashSession,
      yesterdayClosedCash,
      partialSessionsToday,
      todayOrderRows,
    ] = await Promise.all([
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: start, lte: end },
          status: { not: OrderStatus.CANCELLED },
        },
      }),
      this.prisma.order.aggregate({
        where: {
          restaurantId,
          createdAt: { gte: start, lte: end },
          status: { not: OrderStatus.CANCELLED },
        },
        _sum: { total: true },
      }),
      this.prisma.reservation.count({
        where: {
          restaurantId,
          date: { gte: start, lte: end },
          status: {
            in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED],
          },
        },
      }),
      this.prisma.tableSession.count({
        where: { restaurantId, status: 'OPEN' },
      }),
      this.prisma.cashRegisterSession.findFirst({
        where: {
          restaurantId,
          level: CashRegisterLevel.PARTIAL,
          status: CashRegisterSessionStatus.OPEN,
        },
        orderBy: { openedAt: 'desc' },
        include: { terminal: true },
      }),
      this.prisma.cashRegisterSession.findFirst({
        where: {
          restaurantId,
          level: CashRegisterLevel.PARTIAL,
          status: CashRegisterSessionStatus.CLOSED,
        },
        orderBy: { closedAt: 'desc' },
        include: { terminal: true },
      }),
      this.prisma.cashRegisterSession.findFirst({
        where: {
          restaurantId,
          level: CashRegisterLevel.PARTIAL,
          status: CashRegisterSessionStatus.CLOSED,
          closedAt: { gte: yesterdayBounds.start, lte: yesterdayBounds.end },
        },
        orderBy: { closedAt: 'desc' },
      }),
      this.prisma.cashRegisterSession.findMany({
        where: {
          restaurantId,
          level: CashRegisterLevel.PARTIAL,
          status: CashRegisterSessionStatus.CLOSED,
          closedAt: { gte: start, lte: end },
        },
        orderBy: { closedAt: 'asc' },
        include: { terminal: true },
      }),
      this.prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: start, lte: end },
          status: { not: OrderStatus.CANCELLED },
        },
        select: {
          total: true,
          paymentMethod: true,
          orderSource: true,
          tableSessionId: true,
          type: true,
        },
      }),
    ]);

    const salesToday = this.buildSalesTodaySnapshot(
      todayOrderRows,
      openCashRegister,
      partialSessionsToday,
    );

    return {
      businessDate: formatBusinessDate(businessDate),
      todayOrders,
      todayRevenue: todayRevenue._sum.total ?? 0,
      pendingReservations,
      openTableSessions,
      cashRegisterOpen: Boolean(openCashRegister),
      currentCashRegister: openCashRegister
        ? {
            id: openCashRegister.id,
            openedByName: openCashRegister.openedByName,
            openingFloat: openCashRegister.openingFloat,
            expectedCash: openCashRegister.expectedCash,
            openedAt: openCashRegister.openedAt,
            terminal: openCashRegister.terminal
              ? {
                  id: openCashRegister.terminal.id,
                  name: openCashRegister.terminal.name,
                }
              : null,
          }
        : null,
      lastClosedCashSession: lastClosedCashSession
        ? {
            id: lastClosedCashSession.id,
            expectedCash: lastClosedCashSession.expectedCash,
            countedCash: lastClosedCashSession.countedCash,
            difference: lastClosedCashSession.difference,
            closedAt: lastClosedCashSession.closedAt,
          }
        : null,
      yesterdayClosedCash: yesterdayClosedCash
        ? {
            expectedCash: yesterdayClosedCash.expectedCash,
            countedCash: yesterdayClosedCash.countedCash,
            difference: yesterdayClosedCash.difference,
            closedAt: yesterdayClosedCash.closedAt,
          }
        : null,
      partialCashSessionsToday: partialSessionsToday.map((session) => ({
        id: session.id,
        openedByName: session.openedByName,
        openingFloat: session.openingFloat,
        expectedCash: session.expectedCash,
        countedCash: session.countedCash,
        difference: session.difference,
        totalRevenue: this.extractCloseReportTotal(session.closeReport),
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        terminal: session.terminal
          ? { id: session.terminal.id, name: session.terminal.name }
          : null,
      })),
      salesToday,
      dailyClose: await this.buildDailyCloseStatus(
        restaurantId,
        operationRecord,
        {
          cashRegisterOpen: Boolean(openCashRegister),
          openTableSessions,
        },
      ),
    };
  }

  private async buildDailyCloseStatus(
    restaurantId: string,
    operationRecord: {
      dailyClosedAt: Date | null;
      dailyClosedByName: string | null;
      closingChecklist: Prisma.JsonValue | null;
    } | null,
    snapshot: {
      cashRegisterOpen: boolean;
      openTableSessions: number;
    },
  ) {
    const config = await this.loadDailyCloseConfig(restaurantId);
    const blockers = await this.collectCloseBlockers(
      restaurantId,
      operationRecord,
      snapshot,
      config,
    );

    return {
      isClosed: Boolean(operationRecord?.dailyClosedAt),
      closedAt: operationRecord?.dailyClosedAt ?? null,
      closedByName: operationRecord?.dailyClosedByName ?? null,
      canClose: blockers.length === 0,
      blockers,
      config,
    };
  }

  private async loadDailyCloseConfig(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    return resolveDailyCloseConfig(restaurant?.businessRules);
  }

  private async collectCloseBlockers(
    restaurantId: string,
    operationRecord: {
      dailyClosedAt: Date | null;
      closingChecklist: Prisma.JsonValue | null;
    } | null,
    snapshot?: {
      cashRegisterOpen: boolean;
      openTableSessions: number;
    },
    configOverride?: ReturnType<typeof resolveDailyCloseConfig>,
  ): Promise<DailyCloseBlocker[]> {
    const config =
      configOverride ?? (await this.loadDailyCloseConfig(restaurantId));
    const blockers: DailyCloseBlocker[] = [];

    if (operationRecord?.dailyClosedAt) {
      blockers.push({
        code: 'DAILY_ALREADY_CLOSED',
        message: 'La caja diaria ya fue cerrada',
      });
      return blockers;
    }

    let cashRegisterOpen = snapshot?.cashRegisterOpen;
    let openTableSessions = snapshot?.openTableSessions;

    if (cashRegisterOpen === undefined || openTableSessions === undefined) {
      const [openCash, openTables] = await Promise.all([
        this.prisma.cashRegisterSession.findFirst({
          where: {
            restaurantId,
            level: CashRegisterLevel.PARTIAL,
            status: CashRegisterSessionStatus.OPEN,
          },
        }),
        this.prisma.tableSession.count({
          where: { restaurantId, status: 'OPEN' },
        }),
      ]);
      cashRegisterOpen = Boolean(openCash);
      openTableSessions = openTables;
    }

    if (config.requireNoOpenCash && cashRegisterOpen) {
      blockers.push({
        code: 'OPEN_PARTIAL_CASH',
        message:
          'Hay una caja parcial abierta. Cerrala antes del cierre diario.',
      });
    }

    if (config.requireClosedTables && openTableSessions > 0) {
      blockers.push({
        code: 'OPEN_TABLES',
        message: `Hay ${openTableSessions} mesa(s) con cuenta abierta`,
      });
    }

    if (config.requireClosingChecklist && operationRecord) {
      const closingChecklist = normalizeChecklist(
        CLOSING_CHECKLIST_IDS,
        operationRecord.closingChecklist,
      );
      if (!isChecklistComplete(CLOSING_CHECKLIST_IDS, closingChecklist)) {
        blockers.push({
          code: 'INCOMPLETE_CLOSING_CHECKLIST',
          message: 'Completá el checklist de cierre antes de cerrar el día',
        });
      }
    }

    return blockers;
  }

  private buildSalesTodaySnapshot(
    orders: Array<{
      total: number;
      paymentMethod: string;
      orderSource: import('@prisma/client').OrderSource;
      tableSessionId: string | null;
      type: import('@prisma/client').OrderType;
    }>,
    openCashRegister: {
      expectedCash: number;
      countedCash: number | null;
      difference: number | null;
    } | null,
    partialSessionsToday: Array<{
      expectedCash: number;
      countedCash: number | null;
      difference: number | null;
    }>,
  ) {
    const salesByMethodMap = new Map<
      string,
      { total: number; count: number }
    >();
    const channelBreakdown = {
      salon: 0,
      online: 0,
      delivery: 0,
    };

    for (const order of orders) {
      const salon = isSalonFloorOrder(order);
      if (salon) {
        channelBreakdown.salon += order.total;
      } else if (order.type === 'DELIVERY') {
        channelBreakdown.delivery += order.total;
      } else {
        channelBreakdown.online += order.total;
      }

      const method = order.paymentMethod ?? 'unknown';
      const bucket = salesByMethodMap.get(method) ?? { total: 0, count: 0 };
      bucket.total += order.total;
      bucket.count += 1;
      salesByMethodMap.set(method, bucket);
    }

    const closedPartialDifference = partialSessionsToday.reduce(
      (sum, session) => sum + (session.difference ?? 0),
      0,
    );
    const closedPartialExpected = partialSessionsToday.reduce(
      (sum, session) => sum + session.expectedCash,
      0,
    );
    const closedPartialCounted = partialSessionsToday.reduce(
      (sum, session) => sum + (session.countedCash ?? 0),
      0,
    );

    return {
      channelBreakdown,
      salesByMethod: [...salesByMethodMap.entries()]
        .map(([paymentMethod, stats]) => ({
          paymentMethod,
          total: stats.total,
          count: stats.count,
        }))
        .sort((a, b) => b.total - a.total),
      cash: {
        openSessionExpected: openCashRegister?.expectedCash ?? null,
        closedSessionsExpected: closedPartialExpected,
        closedSessionsCounted: closedPartialCounted,
        closedSessionsDifference: closedPartialDifference,
        openSessionActive: Boolean(openCashRegister),
      },
    };
  }

  private extractCloseReportTotal(
    closeReport: Prisma.JsonValue | null,
  ): number | null {
    if (
      !closeReport ||
      typeof closeReport !== 'object' ||
      Array.isArray(closeReport)
    ) {
      return null;
    }
    const total = (closeReport as { totalRevenue?: unknown }).totalRevenue;
    return typeof total === 'number' ? total : null;
  }

  private formatOperation(record: {
    id: string;
    businessDate: Date;
    dailyGoal: string | null;
    openingChecklist: Prisma.JsonValue | null;
    openingCompletedAt: Date | null;
    openingNotes: string | null;
    closingChecklist: Prisma.JsonValue | null;
    closingCompletedAt: Date | null;
    closingNotes: string | null;
    dailyClosedAt: Date | null;
    dailyClosedByName: string | null;
    updatedAt: Date;
  }) {
    const openingChecklist = normalizeChecklist(
      OPENING_CHECKLIST_IDS,
      record.openingChecklist,
    );
    const closingChecklist = normalizeChecklist(
      CLOSING_CHECKLIST_IDS,
      record.closingChecklist,
    );

    return {
      id: record.id,
      businessDate: formatBusinessDate(record.businessDate),
      dailyGoal: record.dailyGoal,
      openingChecklist,
      openingCompletedAt: record.openingCompletedAt,
      openingNotes: record.openingNotes,
      openingComplete: isChecklistComplete(
        OPENING_CHECKLIST_IDS,
        openingChecklist,
      ),
      closingChecklist,
      closingCompletedAt: record.closingCompletedAt,
      closingNotes: record.closingNotes,
      closingComplete: isChecklistComplete(
        CLOSING_CHECKLIST_IDS,
        closingChecklist,
      ),
      dailyClosedAt: record.dailyClosedAt,
      dailyClosedByName: record.dailyClosedByName,
      dailyCloseComplete: Boolean(record.dailyClosedAt),
      updatedAt: record.updatedAt,
    };
  }
}
