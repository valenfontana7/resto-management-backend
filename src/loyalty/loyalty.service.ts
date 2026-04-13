import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const POINTS_PER_CURRENCY_UNIT = 1; // 1 punto por cada $100 gastados (centavos)
const TIER_THRESHOLDS = {
  BRONZE: 0,
  SILVER: 500,
  GOLD: 2000,
  PLATINUM: 5000,
} as const;

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateAccount(
    restaurantId: string,
    customer: { email: string; name: string; phone?: string },
  ) {
    let account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        restaurantId_customerEmail: {
          restaurantId,
          customerEmail: customer.email,
        },
      },
    });

    if (!account) {
      account = await this.prisma.loyaltyAccount.create({
        data: {
          restaurantId,
          customerEmail: customer.email,
          customerName: customer.name,
          customerPhone: customer.phone,
        },
      });
    }

    return account;
  }

  async getAccount(restaurantId: string, customerEmail: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        restaurantId_customerEmail: { restaurantId, customerEmail },
      },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!account)
      throw new NotFoundException('Cuenta de fidelización no encontrada');
    return account;
  }

  async earnPoints(
    restaurantId: string,
    customerEmail: string,
    orderTotal: number,
    orderId?: string,
  ) {
    const points = Math.floor(orderTotal / 100) * POINTS_PER_CURRENCY_UNIT;
    if (points <= 0) return null;

    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        restaurantId_customerEmail: { restaurantId, customerEmail },
      },
    });

    if (!account) return null;

    const [updatedAccount] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          points: { increment: points },
          totalEarned: { increment: points },
          tier: this.calculateTier(account.totalEarned + points),
        },
      }),
      this.prisma.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: 'EARN',
          points,
          description:
            `Puntos por pedido ${orderId ? `#${orderId}` : ''}`.trim(),
          orderId,
        },
      }),
    ]);

    return updatedAccount;
  }

  async redeemPoints(
    restaurantId: string,
    customerEmail: string,
    points: number,
    description?: string,
    orderId?: string,
  ) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: {
        restaurantId_customerEmail: { restaurantId, customerEmail },
      },
    });

    if (!account) throw new NotFoundException('Cuenta no encontrada');
    if (account.points < points)
      throw new BadRequestException('Puntos insuficientes');

    const [updatedAccount] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.update({
        where: { id: account.id },
        data: {
          points: { decrement: points },
          totalRedeemed: { increment: points },
        },
      }),
      this.prisma.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          type: 'REDEEM',
          points: -points,
          description: description || 'Canje de puntos',
          orderId,
        },
      }),
    ]);

    return updatedAccount;
  }

  async listAccounts(restaurantId: string, page = 1, limit = 20) {
    const where = { restaurantId };

    const [accounts, total] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.findMany({
        where,
        orderBy: { points: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.loyaltyAccount.count({ where }),
    ]);

    return {
      accounts,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(restaurantId: string) {
    const [totalAccounts, pointsAgg] = await this.prisma.$transaction([
      this.prisma.loyaltyAccount.count({ where: { restaurantId } }),
      this.prisma.loyaltyAccount.aggregate({
        where: { restaurantId },
        _sum: { points: true, totalEarned: true, totalRedeemed: true },
      }),
    ]);

    return {
      totalAccounts,
      totalPointsActive: pointsAgg._sum.points ?? 0,
      totalPointsEarned: pointsAgg._sum.totalEarned ?? 0,
      totalPointsRedeemed: pointsAgg._sum.totalRedeemed ?? 0,
    };
  }

  private calculateTier(
    totalEarned: number,
  ): 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM' {
    if (totalEarned >= TIER_THRESHOLDS.PLATINUM) return 'PLATINUM';
    if (totalEarned >= TIER_THRESHOLDS.GOLD) return 'GOLD';
    if (totalEarned >= TIER_THRESHOLDS.SILVER) return 'SILVER';
    return 'BRONZE';
  }
}
