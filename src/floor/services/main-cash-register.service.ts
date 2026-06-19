import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
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
  CloseMainCashRegisterDto,
  CreateMainCashMovementDto,
  OpenMainCashRegisterDto,
} from '../dto/main-cash-register.dto';
import { ManualCashMovementType } from '../dto/cash-register.dto';
import type { MainCashCloseReport } from '../types/main-cash-close-report.types';

const MAIN_CASH_MANAGER_ROLES = ['SUPER_ADMIN', 'OWNER', 'ADMIN', 'MANAGER'];

@Injectable()
export class MainCashRegisterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async getOpenSession(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.getOpenMainRecord(restaurantId);
    if (!session) return { session: null };
    return { session: await this.formatSession(session.id) };
  }

  async open(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: OpenMainCashRegisterDto,
  ) {
    await this.verifyMainCashManager(restaurantId, userId);

    const existing = await this.getOpenMainRecord(restaurantId);
    if (existing) {
      throw new BadRequestException('La caja mayor ya está abierta');
    }

    const openingFloat = dto.openingFloat ?? 0;

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.cashRegisterSession.create({
        data: {
          restaurantId,
          level: CashRegisterLevel.MAIN,
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
            description: 'Saldo inicial caja mayor',
            createdByUserId: userId,
            createdByName: userName,
          },
        });
      }

      return created;
    });

    return { session: await this.formatSession(session.id) };
  }

  async close(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: CloseMainCashRegisterDto,
  ) {
    await this.verifyMainCashManager(restaurantId, userId);
    const open = await this.getOpenMainRecord(restaurantId);
    if (!open) {
      throw new NotFoundException('No hay caja mayor abierta');
    }

    const closedAt = new Date();
    const difference = dto.countedCash - open.expectedCash;
    const closeReport = await this.buildCloseReport(open.id, {
      countedCash: dto.countedCash,
      difference,
      closedAt,
      closedByName: userName,
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

  async addMovement(
    restaurantId: string,
    userId: string,
    userName: string,
    dto: CreateMainCashMovementDto,
  ) {
    await this.verifyMainCashManager(restaurantId, userId);
    const open = await this.getOpenMainRecord(restaurantId);
    if (!open) {
      throw new BadRequestException('No hay caja mayor abierta');
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
          data: { expectedCash: { increment: signedAmount } },
        });
      }
    });

    return { session: await this.formatSession(open.id) };
  }

  async depositFromPartial(
    restaurantId: string,
    userId: string,
    userName: string,
    data: { partialSessionId: string; amount: number },
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    if (data.amount <= 0) return;

    const [mainOpen, partial] = await Promise.all([
      this.getOpenMainRecord(restaurantId),
      this.prisma.cashRegisterSession.findFirst({
        where: {
          id: data.partialSessionId,
          restaurantId,
          level: CashRegisterLevel.PARTIAL,
        },
      }),
    ]);

    if (!mainOpen) {
      throw new BadRequestException(
        'Abrí la caja mayor antes de registrar depósitos desde caja parcial',
      );
    }

    if (!partial) {
      throw new NotFoundException('Turno de caja parcial no encontrado');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.cashMovement.create({
        data: {
          sessionId: mainOpen.id,
          sourceSessionId: partial.id,
          type: CashMovementType.DEPOSIT,
          amount: data.amount,
          description: `Depósito desde caja parcial · ${partial.openedByName}`,
          createdByUserId: userId,
          createdByName: userName,
        },
      });

      await tx.cashRegisterSession.update({
        where: { id: mainOpen.id },
        data: { expectedCash: { increment: data.amount } },
      });
    });
  }

  async listHistory(restaurantId: string, userId: string, limit = 10) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const take = Math.min(Math.max(limit, 1), 50);

    const sessions = await this.prisma.cashRegisterSession.findMany({
      where: {
        restaurantId,
        level: CashRegisterLevel.MAIN,
        status: CashRegisterSessionStatus.CLOSED,
      },
      orderBy: { closedAt: 'desc' },
      take,
    });

    return {
      sessions: await Promise.all(
        sessions.map(async (session) => this.formatSession(session.id)),
      ),
    };
  }

  async getCloseReport(
    restaurantId: string,
    userId: string,
    sessionId: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const session = await this.prisma.cashRegisterSession.findFirst({
      where: { id: sessionId, restaurantId, level: CashRegisterLevel.MAIN },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja mayor no encontrada');
    }

    if (
      session.closeReport &&
      typeof session.closeReport === 'object' &&
      !Array.isArray(session.closeReport)
    ) {
      return {
        closeReport: session.closeReport as unknown as MainCashCloseReport,
      };
    }

    if (
      session.status !== CashRegisterSessionStatus.CLOSED ||
      !session.closedAt
    ) {
      throw new BadRequestException('La caja mayor aún no está cerrada');
    }

    const closeReport = await this.buildCloseReport(session.id, {
      countedCash: session.countedCash ?? 0,
      difference: session.difference ?? 0,
      closedAt: session.closedAt,
      closedByName: null,
    });

    return { closeReport };
  }

  private async getOpenMainRecord(restaurantId: string) {
    return this.prisma.cashRegisterSession.findFirst({
      where: {
        restaurantId,
        level: CashRegisterLevel.MAIN,
        status: CashRegisterSessionStatus.OPEN,
      },
      orderBy: { openedAt: 'desc' },
    });
  }

  private async verifyMainCashManager(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { select: { name: true } } },
    });

    const roleName = user?.role?.name;
    if (roleName && MAIN_CASH_MANAGER_ROLES.includes(roleName)) {
      return;
    }

    throw new ForbiddenException(
      'Solo dueño o gerente pueden operar la caja mayor',
    );
  }

  private async buildCloseReport(
    sessionId: string,
    closeMeta: {
      countedCash: number;
      difference: number;
      closedAt: Date;
      closedByName: string | null;
    },
  ): Promise<MainCashCloseReport> {
    const session = await this.prisma.cashRegisterSession.findUnique({
      where: { id: sessionId },
      include: {
        restaurant: { select: { name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!session) {
      throw new NotFoundException('Sesión de caja mayor no encontrada');
    }

    const partialSessionIds = [
      ...new Set(
        session.movements
          .filter((m) => m.sourceSessionId)
          .map((m) => m.sourceSessionId as string),
      ),
    ];

    const partialSessions =
      partialSessionIds.length > 0
        ? await this.prisma.cashRegisterSession.findMany({
            where: { id: { in: partialSessionIds } },
            include: { terminal: { select: { name: true } } },
          })
        : [];

    const partialById = new Map(partialSessions.map((s) => [s.id, s]));

    const depositsFromPartials = session.movements
      .filter((m) => m.type === CashMovementType.DEPOSIT && m.sourceSessionId)
      .map((m) => {
        const partial = partialById.get(m.sourceSessionId!);
        return {
          partialSessionId: m.sourceSessionId!,
          openedByName: partial?.openedByName ?? '—',
          terminal: partial?.terminal?.name ?? null,
          amount: m.amount,
          depositedAt: m.createdAt.toISOString(),
        };
      });

    const manualMovements = session.movements
      .filter(
        (m) =>
          m.type !== CashMovementType.SALE &&
          !(m.type === CashMovementType.DEPOSIT && m.sourceSessionId),
      )
      .map((m) => ({
        type: m.type,
        amount: m.amount,
        description: m.description,
        createdAt: m.createdAt.toISOString(),
      }));

    const totalDeposits = session.movements
      .filter((m) => m.type === CashMovementType.DEPOSIT)
      .reduce((sum, m) => sum + m.amount, 0);
    const totalWithdrawals = session.movements
      .filter((m) => m.type === CashMovementType.WITHDRAWAL)
      .reduce((sum, m) => sum + Math.abs(m.amount), 0);

    return {
      kind: 'MAIN',
      sessionId: session.id,
      restaurantName: session.restaurant.name,
      openedAt: session.openedAt.toISOString(),
      closedAt: closeMeta.closedAt.toISOString(),
      openedByName: session.openedByName,
      closedByName: closeMeta.closedByName,
      openingFloat: session.openingFloat,
      expectedCash: session.expectedCash,
      countedCash: closeMeta.countedCash,
      difference: closeMeta.difference,
      totalDeposits,
      totalWithdrawals,
      depositsFromPartials,
      movements: manualMovements,
    };
  }

  private async formatSession(sessionId: string) {
    const session = await this.prisma.cashRegisterSession.findUnique({
      where: { id: sessionId },
      include: {
        movements: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    if (!session) return null;

    const depositsTotal = await this.prisma.cashMovement.aggregate({
      where: { sessionId, type: CashMovementType.DEPOSIT },
      _sum: { amount: true },
    });

    const withdrawalsTotal = await this.prisma.cashMovement.aggregate({
      where: { sessionId, type: CashMovementType.WITHDRAWAL },
      _sum: { amount: true },
    });

    return {
      id: session.id,
      level: session.level,
      status: session.status,
      openedByName: session.openedByName,
      openingFloat: session.openingFloat,
      expectedCash: session.expectedCash,
      countedCash: session.countedCash,
      difference: session.difference,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      notes: session.notes,
      totalDeposits: depositsTotal._sum.amount ?? 0,
      totalWithdrawals: Math.abs(withdrawalsTotal._sum.amount ?? 0),
      recentMovements: session.movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: m.amount,
        description: m.description,
        sourceSessionId: m.sourceSessionId,
        createdAt: m.createdAt,
        createdByName: m.createdByName,
      })),
    };
  }
}
