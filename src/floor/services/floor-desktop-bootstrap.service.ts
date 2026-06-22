import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OwnershipService } from '../../common/services/ownership.service';
import { S3Service } from '../../storage/s3.service';
import { TablesService } from '../../tables/tables.service';
import { TableSessionService } from './table-session.service';
import { CashRegisterService } from './cash-register.service';
import { OrdersService } from '../../orders/orders.service';

@Injectable()
export class FloorDesktopBootstrapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly s3: S3Service,
    private readonly tables: TablesService,
    private readonly tableSessions: TableSessionService,
    private readonly cashRegister: CashRegisterService,
    private readonly orders: OrdersService,
  ) {}

  async getBootstrap(restaurantId: string, userId: string, ordersLimit = 120) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const safeLimit = Math.min(Math.max(ordersLimit, 1), 200);

    const [
      areasPayload,
      sessionsPayload,
      cashPayload,
      menuCategories,
      ordersPayload,
    ] = await Promise.all([
      this.tables.findAll(restaurantId, userId),
      this.tableSessions.listActive(restaurantId, userId),
      this.cashRegister.getOpenSession(restaurantId, userId),
      this.loadSalonMenuCategories(restaurantId),
      this.orders.findAll(restaurantId, userId, { limit: safeLimit }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      areas: areasPayload.areas,
      sessions: sessionsPayload.sessions,
      cashRegister: cashPayload,
      menu: { categories: menuCategories },
      orders: ordersPayload.orders,
    };
  }

  private async loadSalonMenuCategories(restaurantId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId,
        isActive: true,
        deletedAt: null,
      },
      include: {
        dishes: {
          where: {
            isAvailable: true,
            deletedAt: null,
          },
          orderBy: { name: 'asc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    for (const category of categories) {
      for (const dish of category.dishes) {
        if (dish.image) {
          dish.image = this.s3.toClientUrl(dish.image) as string;
        }
      }
    }

    return categories;
  }
}
