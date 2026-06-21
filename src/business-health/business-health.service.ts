import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { EmailService } from '../email/email.service';
import { ImageProcessingService } from '../common/services/image-processing.service';
import { isSalonFloorOrder } from '../orders/utils/order-channel.util';
import { SendWinBackEmailDto } from './dto/win-back.dto';

const INACTIVE_DAYS = 30;
const PERIOD_DAYS = 30;
const RETENTION_COHORT_DAYS = 90;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function marginPercent(
  salePrice: number,
  costPrice: number | null,
): number | null {
  if (costPrice == null || salePrice <= 0) return null;
  return Math.round(((salePrice - costPrice) / salePrice) * 1000) / 10;
}

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly email: EmailService,
    private readonly images: ImageProcessingService,
  ) {}

  async getDashboard(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - PERIOD_DAYS);

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
          createdAt: { gte: new Date(Date.now() - 120 * 86400000) },
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

    const inactiveCutoff = new Date();
    inactiveCutoff.setDate(inactiveCutoff.getDate() - INACTIVE_DAYS);

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
          (Date.now() - entry.lastOrderAt.getTime()) / 86400000,
        ),
        canEmail: entry.canEmail,
      }));

    const retention = await this.getCustomerRetentionCohorts(restaurantId);

    const menuRecommendations = this.buildMenuRecommendations(dishRows);
    const growthActions = this.buildGrowthActions({
      onlineShare,
      inactiveCustomers,
      dishesWithoutCost: dishes.length - dishesWithCost.length,
      lowStockCount: lowStockItems.length,
    });

    const operationalScore = clampScore(
      100 -
        (openTableSessions > 5 ? 15 : openTableSessions * 2) -
        (openCash ? 0 : 10),
    );
    const commercialScore = clampScore(
      (orders.length > 0 ? 50 : 10) + Math.min(onlineShare, 50),
    );
    const marginScore = clampScore(
      dishes.length === 0
        ? 0
        : (dishesWithCost.length / dishes.length) * 60 +
            (avgMargin != null ? Math.min(avgMargin, 40) : 0),
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
      },
      retention,
    };
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

    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        name: true,
        slug: true,
        logo: true,
        address: true,
        phone: true,
        email: true,
      },
    });
    if (!restaurant) {
      throw new BadRequestException('Restaurante no encontrado');
    }

    const frontendUrl =
      process.env.FRONTEND_URL?.trim().replace(/\/$/, '') ||
      'http://localhost:3000';
    const menuUrl = `${frontendUrl}/${restaurant.slug}`;
    const logoUrl = await this.images.toEmailAssetUrl(restaurant.logo);

    const recipients = await this.listInactiveEmailRecipients(restaurantId);
    const keyFilter = dto.sendToAll ? null : new Set(dto.customerKeys ?? []);
    const maxRecipients = dto.maxRecipients ?? 10;

    const selected = recipients
      .filter((entry) => (keyFilter ? keyFilter.has(entry.key) : true))
      .slice(0, maxRecipients);

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
      });
      if (ok) sent += 1;
      else failed += 1;
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
    const inactiveCutoff = new Date();
    inactiveCutoff.setDate(inactiveCutoff.getDate() - INACTIVE_DAYS);

    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId,
        status: { not: OrderStatus.CANCELLED },
        createdAt: { gte: new Date(Date.now() - 120 * 86400000) },
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
          AND "createdAt" >= CURRENT_DATE - (${RETENTION_COHORT_DAYS}::int || ' day')::interval
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
        new Date(cohort.cohortDay).getTime() <= Date.now() - 8 * 86400000,
    );
    const matureForD30 = cohorts.filter(
      (cohort) =>
        new Date(cohort.cohortDay).getTime() <= Date.now() - 31 * 86400000,
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

  private buildMenuRecommendations(
    dishes: Array<{
      dishId: string;
      name: string;
      marginPercent: number | null;
      unitsSold: number;
      hasCost: boolean;
    }>,
  ) {
    const withData = dishes.filter((d) => d.hasCost && d.marginPercent != null);
    if (withData.length === 0) {
      return [
        {
          id: 'add-costs',
          type: 'setup' as const,
          title: 'Cargá costos en el menú',
          detail:
            'Agregá el costo estimado en cada plato para ver margen y recomendaciones.',
          href: '/admin/menu',
        },
      ];
    }

    const recommendations: Array<{
      id: string;
      type: 'promote' | 'review' | 'setup';
      title: string;
      detail: string;
      href: string;
    }> = [];

    const promote = [...withData]
      .filter((d) => (d.marginPercent ?? 0) >= 40 && d.unitsSold <= 3)
      .slice(0, 2);
    for (const dish of promote) {
      recommendations.push({
        id: `promote-${dish.dishId}`,
        type: 'promote',
        title: `Promocionar "${dish.name}"`,
        detail: `Margen ${dish.marginPercent}% pero pocas ventas (${dish.unitsSold} u.) — ideal para empujar en QR/link.`,
        href: '/admin/menu',
      });
    }

    const review = [...withData]
      .filter((d) => (d.marginPercent ?? 100) < 25 && d.unitsSold >= 5)
      .slice(0, 2);
    for (const dish of review) {
      recommendations.push({
        id: `review-${dish.dishId}`,
        type: 'review',
        title: `Revisar margen de "${dish.name}"`,
        detail: `Margen ${dish.marginPercent}% con ${dish.unitsSold} ventas — evaluá precio o costo.`,
        href: '/admin/menu',
      });
    }

    if (recommendations.length === 0) {
      recommendations.push({
        id: 'balanced',
        type: 'setup',
        title: 'Menú equilibrado',
        detail: 'No hay alertas fuertes de margen vs demanda en este período.',
        href: '/admin/analytics',
      });
    }

    return recommendations;
  }

  private buildGrowthActions(input: {
    onlineShare: number;
    inactiveCustomers: Array<{ name: string; daysInactive: number }>;
    dishesWithoutCost: number;
    lowStockCount: number;
  }) {
    const actions: Array<{
      id: string;
      title: string;
      detail: string;
      href: string;
      priority: 'high' | 'medium' | 'low';
    }> = [];

    if (input.onlineShare < 35) {
      actions.push({
        id: 'direct-channel',
        title: 'Empujar canal directo',
        detail: `Solo ${input.onlineShare}% de ingresos viene del link/QR. Compartí tu menú y evitá comisiones de apps.`,
        href: '/admin/builder',
        priority: 'high',
      });
    }

    if (input.inactiveCustomers.length > 0) {
      actions.push({
        id: 'win-back',
        title: `Recuperar ${input.inactiveCustomers.length} cliente(s) inactivo(s)`,
        detail:
          'Enviá un email de win-back o contactá por WhatsApp con un cupón.',
        href: '/admin/salud#clientes-inactivos',
        priority: 'medium',
      });
    }

    if (input.dishesWithoutCost > 0) {
      actions.push({
        id: 'complete-costs',
        title: `${input.dishesWithoutCost} plato(s) sin costo cargado`,
        detail: 'Completá costos para decisiones semanales de margen.',
        href: '/admin/menu',
        priority: 'medium',
      });
    }

    if (input.lowStockCount > 0) {
      actions.push({
        id: 'restock',
        title: `${input.lowStockCount} insumo(s) en quiebre`,
        detail: 'Reponé stock crítico antes de marcar platos agotados.',
        href: '/admin/salud#inventario',
        priority: 'high',
      });
    }

    return actions;
  }
}
