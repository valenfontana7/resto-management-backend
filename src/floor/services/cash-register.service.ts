import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import {
  CashMovementType,
  CashRegisterLevel,
  CashRegisterSessionStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  CloseCashRegisterDto,
  CreateCashMovementDto,
  ManualCashMovementType,
  OpenCashRegisterDto,
} from '../dto/cash-register.dto';
import type { CashRegisterCloseReport } from '../types/cash-register-close-report.types';
import { MainCashRegisterService } from './main-cash-register.service';
import { FloorAccessService } from './floor-access.service';
import { OperationalEventEmitter } from '../../event-spine/operational-event-emitter.service';
import { OPERATIONAL_EVENT_TYPES } from '../../event-spine/operational-event.types';

@Injectable()
export class CashRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly mainCashRegister: MainCashRegisterService,
    private readonly floorAccess: FloorAccessService,
    @Inject(forwardRef(() => OperationalEventEmitter))
    private readonly operationalEvents: OperationalEventEmitter,
  ) {}

  async getOpenSession(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.getOpenSessionRecord(restaurantId);
    if (!session) {
      return { session: null };
    }
    return { session: await this.formatSession(session.id) };
  }

  async getOpenSessionRecord(restaurantId: string) {
    return this.prisma.cashRegisterSession.findFirst({
      where: {
        restaurantId,
        level: CashRegisterLevel.PARTIAL,
        status: CashRegisterSessionStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  async open(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: OpenCashRegisterDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.floorAccess.verifyCollectAccess(restaurantId, userId);

    const existing = await this.getOpenSessionRecord(restaurantId);
    if (existing) {
      throw new BadRequestException('Ya hay una caja parcial abierta');
    }

    const openingFloat = dto.openingFloat ?? 0;
    if (dto.terminalId) {
      const terminal = await this.prisma.restaurantTerminal.findFirst({
        where: {
          id: dto.terminalId,
          restaurantId,
          isActive: true,
        },
      });
      if (!terminal) {
        throw new BadRequestException('Terminal no válida o inactiva');
      }
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashRegisterSession.create({
        data: {
          restaurantId,
          level: CashRegisterLevel.PARTIAL,
          terminalId: dto.terminalId ?? null,
          openedByUserId: userId,
          openedByName: userName,
          openingFloat,
          expectedCash: openingFloat,
          notes: dto.notes ?? null,
        },
      });

      if (openingFloat > 0) {
        await tx.cashMovement.create({
          data: {
            sessionId: created.id,
            type: CashMovementType.OPENING_FLOAT,
            amount: openingFloat,
            description: 'Fondo de caja inicial',
            createdByUserId: userId,
            createdByName: userName,
          },
        });
      }

      return created;
    });

    void this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.CASH_REGISTER_OPENED,
      aggregateType: 'cash_register_session',
      aggregateId: session.id,
      data: {
        terminalId: dto.terminalId ?? null,
        openingFloat,
        openedByUserId: userId,
      },
    });

    return { session: await this.formatSession(session.id) };
  }

  async close(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: CloseCashRegisterDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.floorAccess.verifyCollectAccess(restaurantId, userId);
    const open = await this.getOpenSessionRecord(restaurantId);
    if (!open) {
      throw new NotFoundException('No hay caja parcial abierta');
    }

    const closedAt = new Date();
    const difference = dto.countedCash - open.expectedCash;
    const depositToMain = dto.depositToMain ?? 0;

    if (depositToMain > dto.countedCash) {
      throw new BadRequestException(
        'El depósito a caja mayor no puede superar el efectivo contado',
      );
    }

    const closeReport = await this.buildCloseReport(open.id, {
      countedCash: dto.countedCash,
      difference,
      closedAt,
      closedByName: userName,
      depositToMain: depositToMain > 0 ? depositToMain : null,
    });

    await this.prisma.cashRegisterSession.update({
      where: { id: open.id },
      data: {
        status: CashRegisterSessionStatus.CLOSED,
        countedCash: dto.countedCash,
        difference,
        closedAt,
        notes: dto.notes ?? open.notes,
        closeReport: closeReport as unknown as Prisma.InputJsonValue,
      },
    });

    if (depositToMain > 0) {
      await this.mainCashRegister.depositFromPartial(
        restaurantId,
        userId,
        userName,
        { partialSessionId: open.id, amount: depositToMain },
      );
    }

    void this.operationalEvents.emit({
      restaurantId,
      eventType: OPERATIONAL_EVENT_TYPES.CASH_REGISTER_CLOSED,
      aggregateType: 'cash_register_session',
      aggregateId: open.id,
      data: {
        countedCash: dto.countedCash,
        expectedCash: open.expectedCash,
        difference,
        depositToMain: depositToMain > 0 ? depositToMain : null,
        closedByUserId: userId,
      },
    });

    return {
      session: await this.formatSession(open.id),
      summary: {
        expectedCash: open.expectedCash,
        countedCash: dto.countedCash,
        difference,
      },
      closeReport,
    };
  }

  async getCloseReport(
    restaurantId: string,
    userId: string,
    sessionId: string,
  ): Promise<{ closeReport: CashRegisterCloseReport }> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.prisma.cashRegisterSession.findFirst({
      where: { id: sessionId, restaurantId },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }
    if (
      session.closeReport &&
      typeof session.closeReport === 'object' &&
      !Array.isArray(session.closeReport)
    ) {
      return {
        closeReport: session.closeReport as unknown as CashRegisterCloseReport,
      };
    }
    if (
      session.status !== CashRegisterSessionStatus.CLOSED ||
      !session.closedAt
    ) {
      throw new BadRequestException('La caja parcial aún no está cerrada');
    }
    const closeReport = await this.buildCloseReport(session.id, {
      countedCash: session.countedCash ?? 0,
      difference: session.difference ?? 0,
      closedAt: session.closedAt,
      closedByName: null,
    });
    return { closeReport };
  }

  async listHistory(restaurantId: string, userId: string, limit = 10) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const take = Math.min(Math.max(limit, 1), 50);

    const sessions = await this.prisma.cashRegisterSession.findMany({
      where: {
        restaurantId,
        level: CashRegisterLevel.PARTIAL,
        status: CashRegisterSessionStatus.CLOSED,
      },
      orderBy: { closedAt: 'desc' },
      take,
      include: { terminal: true },
    });

    return {
      sessions: await Promise.all(
        sessions.map(async (session) => this.formatSession(session.id)),
      ),
    };
  }

  async addMovement(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: CreateCashMovementDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    await this.floorAccess.verifyCollectAccess(restaurantId, userId);
    const open = await this.getOpenSessionRecord(restaurantId);
    if (!open) {
      throw new BadRequestException('No hay caja parcial abierta');
    }

    const signedAmount =
      dto.type === ManualCashMovementType.WITHDRAWAL
        ? -Math.abs(dto.amount)
        : Math.abs(dto.amount);

    await this.prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          sessionId: open.id,
          type: dto.type as CashMovementType,
          amount: signedAmount,
          description: dto.description ?? null,
          createdByUserId: userId,
          createdByName: userName,
        },
      });

      if (dto.type !== ManualCashMovementType.ADJUSTMENT) {
        await tx.cashRegisterSession.update({
          where: { id: open.id },
          data: {
            expectedCash: { increment: signedAmount },
          },
        });
      }
    });

    return { session: await this.formatSession(open.id) };
  }

  async recordSale(
    restaurantId: string,
    data: {
      amount: number;
      paymentMethod: string;
      orderId: string;
      tableSessionId: string;
      createdByUserId: string;
      createdByName?: string;
      description?: string;
    },
  ) {
    const open = await this.getOpenSessionRecord(restaurantId);
    if (!open) return;

    const isCash = data.paymentMethod === 'cash';
    await this.prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          sessionId: open.id,
          tableSessionId: data.tableSessionId,
          type: CashMovementType.SALE,
          amount: data.amount,
          paymentMethod: data.paymentMethod,
          orderId: data.orderId,
          description: data.description ?? 'Venta salón',
          createdByUserId: data.createdByUserId,
          createdByName: data.createdByName ?? null,
        },
      });

      if (isCash) {
        await tx.cashRegisterSession.update({
          where: { id: open.id },
          data: { expectedCash: { increment: data.amount } },
        });
      }
    });
  }

  private async buildCloseReport(
    sessionId: string,
    closeMeta: {
      countedCash: number;
      difference: number;
      closedAt: Date;
      closedByName: string | null;
      depositToMain?: number | null;
    },
  ): Promise<CashRegisterCloseReport> {
    const session = await this.prisma.cashRegisterSession.findUnique({
      where: { id: sessionId },
      include: {
        terminal: true,
        restaurant: { select: { name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja no encontrada');
    }

    const orderIds = [
      ...new Set(
        session.movements
          .filter((m) => m.type === CashMovementType.SALE && m.orderId)
          .map((m) => m.orderId as string),
      ),
    ];

    const [orders, tableSessions] = await Promise.all([
      orderIds.length > 0
        ? this.prisma.order.findMany({
            where: { id: { in: orderIds } },
            select: { id: true, orderNumber: true },
          })
        : Promise.resolve([]),
      this.prisma.tableSession.findMany({
        where: {
          id: {
            in: [
              ...new Set(
                session.movements
                  .filter((m) => m.tableSessionId)
                  .map((m) => m.tableSessionId as string),
              ),
            ],
          },
        },
        include: { table: { select: { number: true } } },
      }),
    ]);

    const orderNumberById = new Map<string, string>(
      orders.map((o): [string, string] => [o.id, o.orderNumber]),
    );
    const tableLabelBySessionId = new Map<string, string>(
      tableSessions.map((ts): [string, string] => [
        ts.id,
        ts.table ? `Mesa ${ts.table.number}` : ts.sessionNumber,
      ]),
    );

    const salesByMethod = await this.prisma.cashMovement.groupBy({
      by: ['paymentMethod'],
      where: {
        sessionId,
        type: CashMovementType.SALE,
      },
      _sum: { amount: true },
      _count: true,
    });

    const saleLines = session.movements
      .filter((m) => m.type === CashMovementType.SALE)
      .map((m) => ({
        orderId: m.orderId,
        orderNumber: m.orderId
          ? (orderNumberById.get(m.orderId) ?? null)
          : null,
        tableLabel: m.tableSessionId
          ? (tableLabelBySessionId.get(m.tableSessionId) ?? null)
          : null,
        amount: m.amount,
        paymentMethod: m.paymentMethod ?? 'unknown',
        paidAt: m.createdAt.toISOString(),
        description: m.description,
      }));

    const otherMovements = session.movements
      .filter((m) => m.type !== CashMovementType.SALE)
      .map((m) => ({
        type: m.type,
        amount: m.amount,
        description: m.description,
        createdAt: m.createdAt.toISOString(),
      }));

    const totalRevenue = saleLines.reduce((sum, line) => sum + line.amount, 0);

    return {
      kind: 'PARTIAL',
      sessionId: session.id,
      restaurantName: session.restaurant.name,
      openedAt: session.openedAt.toISOString(),
      closedAt: closeMeta.closedAt.toISOString(),
      openedByName: session.openedByName,
      closedByName: closeMeta.closedByName,
      terminal: session.terminal
        ? { id: session.terminal.id, name: session.terminal.name }
        : null,
      openingFloat: session.openingFloat,
      expectedCash: session.expectedCash,
      countedCash: closeMeta.countedCash,
      difference: closeMeta.difference,
      salesByMethod: salesByMethod.map((row) => ({
        paymentMethod: row.paymentMethod ?? 'unknown',
        total: row._sum.amount ?? 0,
        count: row._count,
      })),
      totalRevenue,
      orders: saleLines,
      otherMovements,
      depositToMain: closeMeta.depositToMain ?? null,
    };
  }

  private async formatSession(sessionId: string) {
    const session = await this.prisma.cashRegisterSession.findUnique({
      where: { id: sessionId },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
        terminal: true,
      },
    });
    if (!session) return null;

    const salesByMethod = await this.prisma.cashMovement.groupBy({
      by: ['paymentMethod'],
      where: {
        sessionId,
        type: CashMovementType.SALE,
      },
      _sum: { amount: true },
      _count: true,
    });

    return {
      id: session.id,
      status: session.status,
      openedByName: session.openedByName,
      openingFloat: session.openingFloat,
      expectedCash: session.expectedCash,
      countedCash: session.countedCash,
      difference: session.difference,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      notes: session.notes,
      terminal: session.terminal
        ? {
            id: session.terminal.id,
            name: session.terminal.name,
          }
        : null,
      salesByMethod: salesByMethod.map((row) => ({
        paymentMethod: row.paymentMethod ?? 'unknown',
        total: row._sum.amount ?? 0,
        count: row._count,
      })),
      recentMovements: session.movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        paymentMethod: m.paymentMethod,
        description: m.description,
        createdAt: m.createdAt,
      })),
    };
  }
}
