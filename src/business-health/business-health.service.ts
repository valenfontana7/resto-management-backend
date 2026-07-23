import {
  BadRequestException,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { CouponType, OrderSource, OrderStatus } from '@prisma/client';
import { LabBusinessDateService } from '../bentoo-lab/config/lab-business-date.service';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { EmailService } from '../email/email.service';
import { ImageProcessingService } from '../common/services/image-processing.service';
import { isSalonFloorOrder } from '../orders/utils/order-channel.util';
import { SendWinBackEmailDto } from './dto/win-back.dto';
import {
  buildGrowthActions,
  buildMenuRecommendations,
  clampScore,
  computeCommercialScore,
  computeMarginScore,
  computeOperationalScore,
  countPendingActionableOrders,
  countStuckKitchenOrders,
  KITCHEN_STUCK_MINUTES,
  marginPercent,
} from './business-health.utils';
import { BusinessHealthAlertsService } from './business-health-alerts.service';
import { BusinessHealthPdfService } from './business-health-pdf.service';
import {
  getGrowthSettings,
  mergeGrowthSettings,
  startOfUtcDay,
} from './business-health-growth.util';
import { UpdateGrowthSettingsDto } from './dto/growth-settings.dto';
import { UpdateInventorySettingsDto } from './dto/inventory-settings.dto';
import {
  isAutoDeductOnSaleEnabled,
  mergeInventorySettings,
} from './inventory-consumption.utils';

const INACTIVE_DAYS = 30;
const PERIOD_DAYS = 30;
const RETENTION_COHORT_DAYS = 90;
const WIN_BACK_COUPON_CODE = 'BIENVUELTA';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildCustomerKey(order: {
  customerProfileId?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
}): string | null {
  if (order.customerProfileId) return `profile:${order.customerProfileId}`;
  const phone = order.customerPhone?.replace(/\D/g, '');
  if (phone) return `phone:${phone}`;
  const email = order.customerEmail?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return null;
}

function isValidEmail(value: string | null | undefined): value is string {
  return !!value && EMAIL_RE.test(value.trim());
}

@Injectable()
export class BusinessHealthService {
  private readonly logger = new Logger(BusinessHealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly email: EmailService,
    private readonly images: ImageProcessingService,
    private readonly alerts: BusinessHealthAlertsService,
    private readonly pdf: BusinessHealthPdfService,
    @Optional() private readonly labBusinessDate?: LabBusinessDateService,
  ) {}

  /** Wall-clock o simulatedNow Lab (si hay run activo del restaurant). */
  private async resolveNow(restaurantId: string): Promise<Date> {
    const labNow =
      await this.labBusinessDate?.resolveSimulatedNow(restaurantId);
    return labNow ?? new Date();
  }

  private daysBefore(from: Date, days: number): Date {
    const date = new Date(from.getTime());
    date.setDate(date.getDate() - days);
    return date;
  }

  private daysAfter(from: Date, days: number): Date {
    return this.daysBefore(from, -days);
  }

  async getDashboard(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const now = await this.resolveNow(restaurantId);
    const periodStart = this.daysBefore(now, PERIOD_DAYS);

    const [
      dishes,
      orderItems,
      orders,
      inventoryItems,
      openTableSessions,
      openCash,
      customerOrders,
    ] = await Promise.all([
      this.prisma.dish.findMany({
        where: { restaurantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          price: true,
          costPrice: true,
          isAvailable: true,
        },
      }),
      this.prisma.orderItem.findMany({
        where: {
          order: {
            restaurantId,
            createdAt: { gte: periodStart },
            status: { not: OrderStatus.CANCELLED },
          },
        },
        select: {
          dishId: true,
          quantity: true,
          subtotal: true,
        },
      }),
      this.prisma.order.findMany({
        where: {
          restaurantId,
          createdAt: { gte: periodStart },
          status: { not: OrderStatus.CANCELLED },
        },
        select: {
          id: true,
          total: true,
          status: true,
          orderSource: true,
          tableSessionId: true,
          type: true,
          customerPhone: true,
          customerEmail: true,
          customerName: true,
          createdAt: true,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tableSession.count({
        where: { restaurantId, status: 'OPEN' },
      }),
      this.prisma.cashRegisterSession.findFirst({
        where: { restaurantId, status: 'OPEN', level: 'PARTIAL' },
      }),
      this.prisma.order.findMany({
        where: {
          restaurantId,
          status: { not: OrderStatus.CANCELLED },
          createdAt: { gte: this.daysBefore(now, 120) },
        },
        select: {
          customerProfileId: true,
          customerPhone: true,
          customerEmail: true,
          customerName: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      }),
    ]);

    const salesByDish = new Map<
      string,
      { quantity: number; revenue: number }
    >();
    for (const item of orderItems) {
      if (!item.dishId) continue;
      const bucket = salesByDish.get(item.dishId) ?? {
        quantity: 0,
        revenue: 0,
      };
      bucket.quantity += item.quantity;
      bucket.revenue += item.subtotal;
      salesByDish.set(item.dishId, bucket);
    }

    const dishRows = dishes.map((dish) => {
      const sales = salesByDish.get(dish.id) ?? { quantity: 0, revenue: 0 };
      const unitMargin =
        dish.costPrice != null ? dish.price - dish.costPrice : null;
      const marginPct = marginPercent(dish.price, dish.costPrice);
      const grossMarginTotal =
        unitMargin != null ? unitMargin * sales.quantity : null;

      return {
        dishId: dish.id,
        name: dish.name,
        salePrice: dish.price,
        costPrice: dish.costPrice,
        marginPercent: marginPct,
        unitsSold: sales.quantity,
        revenue: sales.revenue,
        grossMarginTotal,
        isAvailable: dish.isAvailable,
        hasCost: dish.costPrice != null,
      };
    });

    const dishesWithCost = dishRows.filter((row) => row.hasCost);
    const avgMargin =
      dishesWithCost.length > 0
        ? dishesWithCost.reduce(
            (sum, row) => sum + (row.marginPercent ?? 0),
            0,
          ) / dishesWithCost.length
        : null;

    const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
    let salonRevenue = 0;
    let onlineRevenue = 0;
    let deliveryRevenue = 0;

    for (const order of orders) {
      if (isSalonFloorOrder(order)) salonRevenue += order.total;
      else if (order.type === 'DELIVERY') deliveryRevenue += order.total;
      else onlineRevenue += order.total;
    }

    const onlineShare =
      totalRevenue > 0
        ? Math.round((onlineRevenue / totalRevenue) * 1000) / 10
        : 0;

    const lowStockItems = inventoryItems
      .filter((item) => item.currentStock <= item.minStock)
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        currentStock: item.currentStock,
        minStock: item.minStock,
        linkedDishIds: item.linkedDishIds,
      }));

    const dishNameById = new Map(dishes.map((d) => [d.id, d.name]));
    const inventoryImpact = lowStockItems.flatMap((item) =>
      item.linkedDishIds.map((dishId) => ({
        inventoryItemId: item.id,
        inventoryItemName: item.name,
        dishId,
        dishName: dishNameById.get(dishId) ?? 'Plato',
      })),
    );

    const inactiveCutoff = this.daysBefore(now, INACTIVE_DAYS);

    const profileIds = [
      ...new Set(
        customerOrders
          .map((order) => order.customerProfileId)
          .filter((id): id is string => !!id),
      ),
    ];
    const profiles =
      profileIds.length > 0
        ? await this.prisma.restaurantCustomerProfile.findMany({
            where: { restaurantId, id: { in: profileIds } },
            select: {
              id: true,
              email: true,
              marketingOptIn: true,
            },
          })
        : [];
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    const lastOrderByCustomer = new Map<
      string,
      {
        key: string;
        name: string;
        phone?: string | null;
        email?: string | null;
        lastOrderAt: Date;
        canEmail: boolean;
      }
    >();

    for (const order of customerOrders) {
      const key = buildCustomerKey(order);
      if (!key || lastOrderByCustomer.has(key)) continue;

      const profile = order.customerProfileId
        ? profileById.get(order.customerProfileId)
        : undefined;
      const resolvedEmail =
        (isValidEmail(order.customerEmail)
          ? order.customerEmail.trim()
          : null) ||
        (isValidEmail(profile?.email) ? profile.email.trim() : null);
      const canEmail =
        !!resolvedEmail &&
        (profile == null || profile.marketingOptIn !== false);

      lastOrderByCustomer.set(key, {
        key,
        name: order.customerName,
        phone: order.customerPhone,
        email: resolvedEmail,
        lastOrderAt: order.createdAt,
        canEmail,
      });
    }

    const inactiveCustomers = [...lastOrderByCustomer.values()]
      .filter((entry) => entry.lastOrderAt < inactiveCutoff)
      .sort((a, b) => a.lastOrderAt.getTime() - b.lastOrderAt.getTime())
      .slice(0, 8)
      .map((entry) => ({
        key: entry.key,
        name: entry.name,
        phone: entry.phone,
        email: entry.email,
        lastOrderAt: entry.lastOrderAt.toISOString(),
        daysInactive: Math.floor(
          (now.getTime() - entry.lastOrderAt.getTime()) / 86400000,
        ),
        canEmail: entry.canEmail,
      }));

    const retention = await this.getCustomerRetentionCohorts(restaurantId);

    const weekAgo = this.daysBefore(now, 7);
    const [restaurantMeta, lastScheduledWinBack, scheduledLast7Days] =
      await Promise.all([
        this.prisma.restaurant.findUnique({
          where: { id: restaurantId },
          select: { businessRules: true },
        }),
        this.prisma.winBackEmailLog.findFirst({
          where: { restaurantId, source: 'scheduled' },
          orderBy: { sentAt: 'desc' },
          select: { sentAt: true },
        }),
        this.prisma.winBackEmailLog.count({
          where: {
            restaurantId,
            source: 'scheduled',
            sentAt: { gte: weekAgo },
          },
        }),
      ]);
    const growthSettingsMeta = getGrowthSettings(restaurantMeta?.businessRules);

    const menuRecommendations = buildMenuRecommendations(dishRows);
    const growthActions = buildGrowthActions({
      onlineShare,
      inactiveCustomers,
      dishesWithoutCost: dishes.length - dishesWithCost.length,
      lowStockCount: lowStockItems.length,
    });

    const operationalScore = computeOperationalScore({
      openTableSessions,
      cashRegisterOpen: Boolean(openCash),
      pendingActionableOrders: countPendingActionableOrders(orders),
      stuckKitchenOrders: countStuckKitchenOrders(orders),
    });
    const commercialScore = computeCommercialScore(orders.length, onlineShare);
    const marginScore = computeMarginScore(
      dishes.length,
      dishesWithCost.length,
      avgMargin,
    );

    const dashboard = {
      periodDays: PERIOD_DAYS,
      healthScore: {
        overall: clampScore(
          (operationalScore + commercialScore + marginScore) / 3,
        ),
        operational: operationalScore,
        commercial: commercialScore,
        margin: marginScore,
      },
      margin: {
        dishesWithCostCount: dishesWithCost.length,
        dishesWithoutCostCount: dishes.length - dishesWithCost.length,
        averageMarginPercent: avgMargin,
        items: dishRows.sort(
          (a, b) => (b.grossMarginTotal ?? 0) - (a.grossMarginTotal ?? 0),
        ),
        topProfitable: dishRows
          .filter((row) => row.grossMarginTotal != null)
          .sort((a, b) => (b.grossMarginTotal ?? 0) - (a.grossMarginTotal ?? 0))
          .slice(0, 5),
        lowMarginAlerts: dishRows
          .filter(
            (row) =>
              row.marginPercent != null &&
              row.marginPercent < 25 &&
              row.unitsSold > 0,
          )
          .slice(0, 5),
      },
      inventory: {
        totalItems: inventoryItems.length,
        lowStockItems,
        affectedDishes: inventoryImpact,
        settings: {
          autoDeductOnSale: isAutoDeductOnSaleEnabled(
            restaurantMeta?.businessRules,
          ),
        },
      },
      commercial: {
        totalOrders: orders.length,
        totalRevenue,
        channelBreakdown: {
          salon: salonRevenue,
          online: onlineRevenue,
          delivery: deliveryRevenue,
        },
        onlineSharePercent: onlineShare,
      },
      growth: {
        inactiveCustomers,
        recommendations: menuRecommendations,
        actions: growthActions,
        settings: {
          autoWinBackEnabled: growthSettingsMeta.autoWinBackEnabled,
          autoWinBackMaxPerWeek: growthSettingsMeta.autoWinBackMaxPerWeek,
          autoWinBackIncludeCoupon: growthSettingsMeta.autoWinBackIncludeCoupon,
          winBackCouponPercent: growthSettingsMeta.winBackCouponPercent,
          lastScheduledWinBackAt:
            lastScheduledWinBack?.sentAt.toISOString() ?? null,
          scheduledEmailsLast7Days: scheduledLast7Days,
        },
      },
      retention,
    };

    void this.alerts
      .syncFromDashboard(restaurantId, dashboard)
      .catch((error) => {
        this.logger.warn(
          `No se pudieron sincronizar alertas de salud para ${restaurantId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      });

    return dashboard;
  }

  async getInsightsSummary(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const now = await this.resolveNow(restaurantId);
    const periodStart = this.daysBefore(now, PERIOD_DAYS);
    const stuckThreshold = new Date(
      now.getTime() - KITCHEN_STUCK_MINUTES * 60_000,
    );

    const [
      dishes,
      inventoryItems,
      openTableSessions,
      openCash,
      pendingActionableOrders,
      stuckKitchenOrders,
      periodOrderCount,
      onlineOrderCount,
    ] = await Promise.all([
      this.prisma.dish.findMany({
        where: { restaurantId, deletedAt: null },
        select: {
          id: true,
          name: true,
          price: true,
          costPrice: true,
          isAvailable: true,
        },
      }),
      this.prisma.inventoryItem.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.tableSession.count({
        where: { restaurantId, status: 'OPEN' },
      }),
      this.prisma.cashRegisterSession.findFirst({
        where: { restaurantId, status: 'OPEN', level: 'PARTIAL' },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: {
            in: [OrderStatus.PENDING, OrderStatus.PAID, OrderStatus.CONFIRMED],
          },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          status: {
            in: [
              OrderStatus.CONFIRMED,
              OrderStatus.PREPARING,
              OrderStatus.PAID,
            ],
          },
          createdAt: { lte: stuckThreshold },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: periodStart },
          status: { not: OrderStatus.CANCELLED },
        },
      }),
      this.prisma.order.count({
        where: {
          restaurantId,
          createdAt: { gte: periodStart },
          status: { not: OrderStatus.CANCELLED },
          type: { not: 'DELIVERY' },
          NOT: {
            OR: [
              {
                orderSource: {
                  in: [OrderSource.FLOOR_FINAL, OrderSource.FLOOR_COMANDA],
                },
              },
              { tableSessionId: { not: null } },
            ],
          },
        },
      }),
    ]);

    const dishRows = dishes.map((dish) => {
      const marginPct = marginPercent(dish.price, dish.costPrice);
      return {
        dishId: dish.id,
        name: dish.name,
        salePrice: dish.price,
        costPrice: dish.costPrice,
        marginPercent: marginPct,
        unitsSold: 0,
        revenue: 0,
        grossMarginTotal: null,
        isAvailable: dish.isAvailable,
        hasCost: dish.costPrice != null,
      };
    });

    const dishesWithCost = dishRows.filter((row) => row.hasCost);
    const avgMargin =
      dishesWithCost.length > 0
        ? dishesWithCost.reduce(
            (sum, row) => sum + (row.marginPercent ?? 0),
            0,
          ) / dishesWithCost.length
        : null;

    const lowStockItems = inventoryItems
      .filter((item) => item.currentStock <= item.minStock)
      .map((item) => ({
        id: item.id,
        name: item.name,
        unit: item.unit,
        currentStock: item.currentStock,
        minStock: item.minStock,
        linkedDishIds: item.linkedDishIds,
      }));

    const onlineShare =
      periodOrderCount > 0
        ? Math.round((onlineOrderCount / periodOrderCount) * 1000) / 10
        : 0;

    const growthActions = buildGrowthActions({
      onlineShare,
      inactiveCustomers: [],
      dishesWithoutCost: dishes.length - dishesWithCost.length,
      lowStockCount: lowStockItems.length,
    });

    const operationalScore = computeOperationalScore({
      openTableSessions,
      cashRegisterOpen: Boolean(openCash),
      pendingActionableOrders,
      stuckKitchenOrders,
    });
    const commercialScore = computeCommercialScore(
      periodOrderCount,
      onlineShare,
    );
    const marginScore = computeMarginScore(
      dishes.length,
      dishesWithCost.length,
      avgMargin,
    );

    return {
      periodDays: PERIOD_DAYS,
      healthScore: {
        overall: clampScore(
          (operationalScore + commercialScore + marginScore) / 3,
        ),
        operational: operationalScore,
        commercial: commercialScore,
        margin: marginScore,
      },
      margin: {
        dishesWithCostCount: dishesWithCost.length,
        dishesWithoutCostCount: dishes.length - dishesWithCost.length,
        averageMarginPercent: avgMargin,
        items: dishRows,
        topProfitable: [],
        lowMarginAlerts: [],
      },
      inventory: {
        totalItems: inventoryItems.length,
        lowStockItems,
        affectedDishes: [],
      },
      growth: {
        inactiveCustomers: [],
        recommendations: [],
        actions: growthActions,
      },
    };
  }

  async getSnapshotHistory(restaurantId: string, userId: string, days = 30) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const now = await this.resolveNow(restaurantId);
    const since = startOfUtcDay(now);
    since.setUTCDate(since.getUTCDate() - days);

    const snapshots = await this.prisma.businessHealthSnapshot.findMany({
      where: {
        restaurantId,
        snapshotDate: { gte: since },
      },
      orderBy: { snapshotDate: 'asc' },
      select: {
        snapshotDate: true,
        overall: true,
        operational: true,
        commercial: true,
        margin: true,
      },
    });

    return {
      snapshots: snapshots.map((row) => ({
        date: row.snapshotDate.toISOString().slice(0, 10),
        overall: row.overall,
        operational: row.operational,
        commercial: row.commercial,
        margin: row.margin,
      })),
    };
  }

  async recordDailySnapshot(restaurantId: string): Promise<void> {
    const ownerMembership = await this.prisma.restaurantMembership.findFirst({
      where: {
        restaurantId,
        role: { name: 'OWNER' },
      },
      select: { userId: true },
    });
    if (!ownerMembership) return;

    const dashboard = await this.getDashboard(
      restaurantId,
      ownerMembership.userId,
    );
    const snapshotDate = startOfUtcDay(await this.resolveNow(restaurantId));

    await this.prisma.businessHealthSnapshot.upsert({
      where: {
        restaurantId_snapshotDate: { restaurantId, snapshotDate },
      },
      create: {
        restaurantId,
        snapshotDate,
        overall: dashboard.healthScore.overall,
        operational: dashboard.healthScore.operational,
        commercial: dashboard.healthScore.commercial,
        margin: dashboard.healthScore.margin,
      },
      update: {
        overall: dashboard.healthScore.overall,
        operational: dashboard.healthScore.operational,
        commercial: dashboard.healthScore.commercial,
        margin: dashboard.healthScore.margin,
      },
    });
  }

  async updateGrowthSettings(
    restaurantId: string,
    userId: string,
    dto: UpdateGrowthSettingsDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    if (!restaurant) {
      throw new BadRequestException('Restaurante no encontrado');
    }

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        businessRules: mergeGrowthSettings(restaurant.businessRules, {
          ...(dto.autoWinBackEnabled !== undefined
            ? { autoWinBackEnabled: dto.autoWinBackEnabled }
            : {}),
          ...(dto.autoWinBackIncludeCoupon !== undefined
            ? { autoWinBackIncludeCoupon: dto.autoWinBackIncludeCoupon }
            : {}),
          ...(dto.winBackCouponPercent !== undefined
            ? { winBackCouponPercent: dto.winBackCouponPercent }
            : {}),
        }) as object,
      },
    });

    const updated = getGrowthSettings(
      mergeGrowthSettings(restaurant.businessRules, dto),
    );

    return {
      autoWinBackEnabled: updated.autoWinBackEnabled,
      autoWinBackIncludeCoupon: updated.autoWinBackIncludeCoupon,
      winBackCouponPercent: updated.winBackCouponPercent,
    };
  }

  async updateInventorySettings(
    restaurantId: string,
    userId: string,
    dto: UpdateInventorySettingsDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    if (!restaurant) {
      throw new BadRequestException('Restaurante no encontrado');
    }

    const merged = mergeInventorySettings(restaurant.businessRules, {
      ...(dto.autoDeductOnSale !== undefined
        ? { autoDeductOnSale: dto.autoDeductOnSale }
        : {}),
    });

    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: { businessRules: merged as object },
    });

    return {
      autoDeductOnSale: isAutoDeductOnSaleEnabled(merged),
    };
  }

  async runScheduledWinBack(restaurantId: string): Promise<{
    sent: number;
    failed: number;
  }> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { businessRules: true },
    });
    if (!restaurant) return { sent: 0, failed: 0 };

    const settings = getGrowthSettings(restaurant.businessRules);
    if (!settings.autoWinBackEnabled) return { sent: 0, failed: 0 };

    const result = await this.executeWinBackSend(restaurantId, {
      sendToAll: true,
      maxRecipients: settings.autoWinBackMaxPerWeek,
      source: 'scheduled',
      cooldownDays: 30,
    });

    return { sent: result.sent, failed: result.failed };
  }

  /** Resumen de salud para digest semanal (sin auth de usuario final). */
  async getDigestSnapshot(restaurantId: string): Promise<{
    healthScoreOverall: number;
    marginScore: number;
    averageMarginPercent: number | null;
    dishesWithoutCostCount: number;
    lowStockCount: number;
    inactiveCustomersCount: number;
    topActionTitle: string | null;
    topActionDetail: string | null;
    d7Rate: number | null;
    d30Rate: number | null;
  } | null> {
    try {
      const ownerMembership = await this.prisma.restaurantMembership.findFirst({
        where: {
          restaurantId,
          role: { name: 'OWNER' },
        },
        select: { userId: true },
      });
      if (!ownerMembership) return null;

      const dashboard = await this.getDashboard(
        restaurantId,
        ownerMembership.userId,
      );
      const topAction = dashboard.growth.actions[0] ?? null;

      return {
        healthScoreOverall: dashboard.healthScore.overall,
        marginScore: dashboard.healthScore.margin,
        averageMarginPercent: dashboard.margin.averageMarginPercent,
        dishesWithoutCostCount: dashboard.margin.dishesWithoutCostCount,
        lowStockCount: dashboard.inventory.lowStockItems.length,
        inactiveCustomersCount: dashboard.growth.inactiveCustomers.length,
        topActionTitle: topAction?.title ?? null,
        topActionDetail: topAction?.detail ?? null,
        d7Rate: dashboard.retention.averageD7Rate,
        d30Rate: dashboard.retention.averageD30Rate,
      };
    } catch (error) {
      this.logger.warn(
        `Digest de salud no disponible para ${restaurantId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  async exportPdf(restaurantId: string, userId: string): Promise<Buffer> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const [dashboard, restaurant] = await Promise.all([
      this.getDashboard(restaurantId, userId),
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true },
      }),
    ]);

    if (!restaurant) {
      throw new BadRequestException('Restaurante no encontrado');
    }

    return this.pdf.generateReport({
      restaurantName: restaurant.name,
      periodDays: dashboard.periodDays,
      dashboard,
    });
  }

  async sendWinBackEmails(
    restaurantId: string,
    userId: string,
    dto: SendWinBackEmailDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    if (
      !dto.sendToAll &&
      (!dto.customerKeys || dto.customerKeys.length === 0)
    ) {
      throw new BadRequestException(
        'Indicá customerKeys o sendToAll para enviar win-back',
      );
    }

    return this.executeWinBackSend(restaurantId, {
      customerKeys: dto.customerKeys,
      sendToAll: dto.sendToAll,
      maxRecipients: dto.maxRecipients ?? 10,
      source: 'manual',
    });
  }

  private async executeWinBackSend(
    restaurantId: string,
    options: {
      customerKeys?: string[];
      sendToAll?: boolean;
      maxRecipients: number;
      source: 'manual' | 'scheduled';
      cooldownDays?: number;
    },
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        slug: true,
        logo: true,
        address: true,
        phone: true,
        email: true,
        businessRules: true,
      },
    });
    if (!restaurant) {
      throw new BadRequestException('Restaurante no encontrado');
    }

    const growthSettings = getGrowthSettings(restaurant.businessRules);
    let coupon: { code: string; percent: number } | null = null;
    if (growthSettings.autoWinBackIncludeCoupon) {
      coupon = await this.getOrCreateWinBackCoupon(
        restaurantId,
        growthSettings.winBackCouponPercent,
      );
    }

    const frontendUrl =
      process.env.FRONTEND_URL?.trim().replace(/\/$/, '') ||
      'http://localhost:3000';
    const menuUrl = coupon
      ? `${frontendUrl}/${restaurant.slug}?coupon=${encodeURIComponent(coupon.code)}`
      : `${frontendUrl}/${restaurant.slug}`;
    const logoUrl = await this.images.toEmailAssetUrl(restaurant.logo);

    const now = await this.resolveNow(restaurantId);
    const recipients = await this.listInactiveEmailRecipients(restaurantId);
    const keyFilter = options.sendToAll
      ? null
      : new Set(options.customerKeys ?? []);
    const maxRecipients = options.maxRecipients;

    let eligible = recipients.filter((entry) =>
      keyFilter ? keyFilter.has(entry.key) : true,
    );

    if (options.cooldownDays && options.cooldownDays > 0) {
      const cutoff = this.daysBefore(now, options.cooldownDays);
      const recentLogs = await this.prisma.winBackEmailLog.findMany({
        where: {
          restaurantId,
          sentAt: { gte: cutoff },
          customerKey: { in: eligible.map((entry) => entry.key) },
        },
        select: { customerKey: true },
      });
      const recentlySent = new Set(recentLogs.map((log) => log.customerKey));
      eligible = eligible.filter((entry) => !recentlySent.has(entry.key));
    }

    const selected = eligible.slice(0, maxRecipients);

    if (selected.length === 0) {
      return {
        sent: 0,
        failed: 0,
        skipped: recipients.length,
        message: 'No hay clientes elegibles con email para win-back',
      };
    }

    let sent = 0;
    let failed = 0;

    for (const customer of selected) {
      if (!customer.email) continue;
      const ok = await this.email.sendWinBackEmail({
        to: customer.email,
        customerName: customer.name,
        restaurantName: restaurant.name,
        menuUrl,
        logoUrl,
        restaurantAddress: restaurant.address,
        restaurantPhone: restaurant.phone,
        restaurantEmail: restaurant.email,
        couponCode: coupon?.code,
        couponPercent: coupon?.percent,
      });
      if (ok) {
        sent += 1;
        await this.prisma.winBackEmailLog.create({
          data: {
            restaurantId,
            customerKey: customer.key,
            customerEmail: customer.email,
            source: options.source,
          },
        });
      } else failed += 1;
    }

    return {
      sent,
      failed,
      skipped: recipients.length - selected.length,
      recipients: selected.map((entry) => ({
        key: entry.key,
        name: entry.name,
        email: entry.email,
      })),
    };
  }

  private async listInactiveEmailRecipients(restaurantId: string) {
    const now = await this.resolveNow(restaurantId);
    const inactiveCutoff = this.daysBefore(now, INACTIVE_DAYS);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: this.daysBefore(now, 120) },
      },
      select: {
        customerProfileId: true,
        customerPhone: true,
        customerEmail: true,
        customerName: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const profileIds = [
      ...new Set(
        orders
          .map((order) => order.customerProfileId)
          .filter((id): id is string => !!id),
      ),
    ];
    const profiles =
      profileIds.length > 0
        ? await this.prisma.restaurantCustomerProfile.findMany({
            where: { restaurantId, id: { in: profileIds } },
            select: {
              id: true,
              email: true,
              marketingOptIn: true,
            },
          })
        : [];
    const profileById = new Map(
      profiles.map((profile) => [profile.id, profile]),
    );

    const lastOrderByCustomer = new Map<
      string,
      {
        key: string;
        name: string;
        email: string | null;
        lastOrderAt: Date;
        canEmail: boolean;
      }
    >();

    for (const order of orders) {
      const key = buildCustomerKey(order);
      if (!key || lastOrderByCustomer.has(key)) continue;

      const profile = order.customerProfileId
        ? profileById.get(order.customerProfileId)
        : undefined;
      const resolvedEmail =
        (isValidEmail(order.customerEmail)
          ? order.customerEmail.trim()
          : null) ||
        (isValidEmail(profile?.email) ? profile.email.trim() : null);
      const canEmail =
        !!resolvedEmail &&
        (profile == null || profile.marketingOptIn !== false);

      lastOrderByCustomer.set(key, {
        key,
        name: order.customerName,
        email: resolvedEmail,
        lastOrderAt: order.createdAt,
        canEmail,
      });
    }

    return [...lastOrderByCustomer.values()]
      .filter(
        (entry) =>
          entry.lastOrderAt < inactiveCutoff && entry.canEmail && entry.email,
      )
      .sort((a, b) => a.lastOrderAt.getTime() - b.lastOrderAt.getTime());
  }

  private async getCustomerRetentionCohorts(restaurantId: string) {
    const now = await this.resolveNow(restaurantId);
    const since = this.daysBefore(now, RETENTION_COHORT_DAYS);
    const rows = await this.prisma.$queryRaw<
      Array<{
        cohort_day: Date;
        customers: bigint;
        d7: bigint;
        d30: bigint;
      }>
    >`
      WITH customer_orders AS (
        SELECT
          COALESCE(
            CASE WHEN "customerProfileId" IS NOT NULL THEN 'profile:' || "customerProfileId" END,
            CASE
              WHEN NULLIF(regexp_replace(COALESCE("customerPhone", ''), '[^0-9]', '', 'g'), '') IS NOT NULL
              THEN 'phone:' || NULLIF(regexp_replace(COALESCE("customerPhone", ''), '[^0-9]', '', 'g'), '')
            END,
            CASE
              WHEN NULLIF(lower(trim(COALESCE("customerEmail", ''))), '') IS NOT NULL
              THEN 'email:' || NULLIF(lower(trim(COALESCE("customerEmail", ''))), '')
            END
          ) AS customer_key,
          DATE("createdAt") AS order_day
        FROM "Order"
        WHERE "restaurantId" = ${restaurantId}
          AND status != 'CANCELLED'
          AND "createdAt" >= ${since}
      ),
      cohort AS (
        SELECT customer_key, MIN(order_day) AS cohort_day
        FROM customer_orders
        WHERE customer_key IS NOT NULL
        GROUP BY customer_key
      ),
      activity AS (
        SELECT DISTINCT customer_key, order_day
        FROM customer_orders
        WHERE customer_key IS NOT NULL
      )
      SELECT
        c.cohort_day,
        COUNT(DISTINCT c.customer_key)::bigint AS customers,
        COUNT(DISTINCT CASE WHEN a.order_day = c.cohort_day + INTERVAL '7 day' THEN c.customer_key END)::bigint AS d7,
        COUNT(DISTINCT CASE WHEN a.order_day = c.cohort_day + INTERVAL '30 day' THEN c.customer_key END)::bigint AS d30
      FROM cohort c
      LEFT JOIN activity a ON a.customer_key = c.customer_key
      GROUP BY c.cohort_day
      ORDER BY c.cohort_day DESC
    `;

    const cohorts = rows.map((row) => {
      const customers = Number(row.customers);
      const d7Count = Number(row.d7);
      const d30Count = Number(row.d30);
      return {
        cohortDay: row.cohort_day.toISOString().slice(0, 10),
        customers,
        d7Count,
        d30Count,
        d7Rate:
          customers > 0 ? Math.round((d7Count / customers) * 1000) / 10 : null,
        d30Rate:
          customers > 0 ? Math.round((d30Count / customers) * 1000) / 10 : null,
      };
    });

    const matureForD7 = cohorts.filter(
      (cohort) =>
        new Date(cohort.cohortDay).getTime() <= now.getTime() - 8 * 86400000,
    );
    const matureForD30 = cohorts.filter(
      (cohort) =>
        new Date(cohort.cohortDay).getTime() <= now.getTime() - 31 * 86400000,
    );

    const sumCustomersD7 = matureForD7.reduce(
      (acc, cohort) => acc + cohort.customers,
      0,
    );
    const sumD7 = matureForD7.reduce((acc, cohort) => acc + cohort.d7Count, 0);
    const sumCustomersD30 = matureForD30.reduce(
      (acc, cohort) => acc + cohort.customers,
      0,
    );
    const sumD30 = matureForD30.reduce(
      (acc, cohort) => acc + cohort.d30Count,
      0,
    );

    return {
      sinceDays: RETENTION_COHORT_DAYS,
      averageD7Rate:
        sumCustomersD7 > 0
          ? Math.round((sumD7 / sumCustomersD7) * 1000) / 10
          : null,
      averageD30Rate:
        sumCustomersD30 > 0
          ? Math.round((sumD30 / sumCustomersD30) * 1000) / 10
          : null,
      sampleCustomersD7: sumCustomersD7,
      sampleCustomersD30: sumCustomersD30,
      cohorts: cohorts.slice(0, 14),
    };
  }

  private async getOrCreateWinBackCoupon(
    restaurantId: string,
    percent: number,
  ): Promise<{ code: string; percent: number }> {
    const now = await this.resolveNow(restaurantId);
    const validUntil = this.daysAfter(now, 45);

    const existing = await this.prisma.coupon.findFirst({
      where: { restaurantId, code: WIN_BACK_COUPON_CODE },
    });

    if (existing) {
      await this.prisma.coupon.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          validUntil,
          value: percent,
          type: CouponType.PERCENTAGE,
          name: 'Win-back clientes inactivos',
        },
      });
    } else {
      await this.prisma.coupon.create({
        data: {
          restaurantId,
          code: WIN_BACK_COUPON_CODE,
          name: 'Win-back clientes inactivos',
          description: 'Cupón automático para recuperación de clientes',
          type: CouponType.PERCENTAGE,
          value: percent,
          validFrom: now,
          validUntil,
          isActive: true,
        },
      });
    }

    return { code: WIN_BACK_COUPON_CODE, percent };
  }
}
