import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SubscriptionStatus } from '@prisma/client';
import { formatMasterAuditAction } from '../audit-action-labels';

export interface AuditLogListItem {
  id: string;
  action: string;
  createdAt: string;
  adminId: string;
  adminName: string | null;
  adminEmail: string | null;
  targetRestaurantId: string | null;
  targetRestaurantName: string | null;
  details: Record<string, unknown> | null;
}

export interface BillingOverviewResponse {
  estimatedMrr: number;
  estimatedArr: number;
  byPlan: Array<{
    planType: string;
    count: number;
    estimatedMrr: number;
  }>;
  activeTrials: number;
  trialsExpiring7d: number;
  canceledLast30d: number;
  freeAccounts: number;
  paidAccounts: number;
}

export interface AlertInboxItem {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  href?: string;
  createdAt: string;
  category: string;
}

@Injectable()
export class SuperAdminPlatformService {
  private readonly planPrices: Record<string, number> = {
    STARTER: 0,
    PROFESSIONAL: 29900,
    ENTERPRISE: 79900,
  };

  constructor(private readonly prisma: PrismaService) {}

  async getAuditLogs(options: {
    restaurantId?: string;
    action?: string;
    adminId?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);

    const where: {
      targetRestaurantId?: string;
      action?: string;
      adminId?: string;
    } = {};

    if (options.restaurantId) where.targetRestaurantId = options.restaurantId;
    if (options.action) where.action = options.action;
    if (options.adminId) where.adminId = options.adminId;

    const [total, rows] = await Promise.all([
      this.prisma.adminAuditLog.count({ where }),
      this.prisma.adminAuditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
        include: {
          admin: { select: { id: true, name: true, email: true } },
          targetRestaurant: { select: { id: true, name: true } },
        },
      }),
    ]);

    const data: AuditLogListItem[] = rows.map((row) => ({
      id: row.id,
      action: row.action,
      createdAt: row.createdAt.toISOString(),
      adminId: row.adminId,
      adminName: row.admin?.name ?? null,
      adminEmail: row.admin?.email ?? null,
      targetRestaurantId: row.targetRestaurantId,
      targetRestaurantName: row.targetRestaurant?.name ?? null,
      details:
        row.details && typeof row.details === 'object'
          ? (row.details as Record<string, unknown>)
          : null,
    }));

    return { data, meta: { total, limit, offset } };
  }

  async getBillingOverview(): Promise<BillingOverviewResponse> {
    const now = new Date();
    const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const last30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const subscriptions = await this.prisma.subscription.findMany({
      where: { isBillingAnchor: true },
      select: {
        planType: true,
        status: true,
        trialEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
      },
    });

    const byPlanMap = new Map<string, number>();
    let estimatedMrr = 0;
    let activeTrials = 0;
    let trialsExpiring7d = 0;
    let freeAccounts = 0;
    let paidAccounts = 0;

    for (const sub of subscriptions) {
      const plan = sub.planType || 'STARTER';
      byPlanMap.set(plan, (byPlanMap.get(plan) ?? 0) + 1);

      const price = this.planPrices[plan] ?? 0;
      const isActive =
        sub.status === SubscriptionStatus.ACTIVE ||
        sub.status === SubscriptionStatus.TRIALING;

      if (isActive && price > 0) {
        estimatedMrr += price;
        paidAccounts += 1;
      } else if (isActive) {
        freeAccounts += 1;
      }

      if (sub.status === SubscriptionStatus.TRIALING && sub.trialEnd) {
        activeTrials += 1;
        if (sub.trialEnd <= in7d && sub.trialEnd >= now) {
          trialsExpiring7d += 1;
        }
      }
    }

    const canceledLast30d = subscriptions.filter(
      (sub) => sub.canceledAt && sub.canceledAt >= last30d,
    ).length;

    const byPlan = Array.from(byPlanMap.entries()).map(([planType, count]) => ({
      planType,
      count,
      estimatedMrr: count * (this.planPrices[planType] ?? 0),
    }));

    return {
      estimatedMrr,
      estimatedArr: estimatedMrr * 12,
      byPlan,
      activeTrials,
      trialsExpiring7d,
      canceledLast30d,
      freeAccounts,
      paidAccounts,
    };
  }

  async getAlertInbox(limit = 30): Promise<AlertInboxItem[]> {
    const items: AlertInboxItem[] = [];
    const now = new Date();

    const settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        maintenanceEnabled: true,
        registrationDisabled: true,
        updatedAt: true,
      },
    });

    if (settings?.maintenanceEnabled) {
      items.push({
        id: 'maintenance',
        severity: 'critical',
        title: 'Modo mantenimiento activo',
        message:
          'La plataforma está en mantenimiento para usuarios no fundadores.',
        href: '/master/settings',
        createdAt: settings.updatedAt?.toISOString() ?? now.toISOString(),
        category: 'platform',
      });
    }

    const trialSubs = await this.prisma.subscription.findMany({
      where: {
        status: SubscriptionStatus.TRIALING,
        trialEnd: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
      take: 10,
      select: {
        id: true,
        trialEnd: true,
        restaurant: { select: { id: true, name: true } },
      },
    });

    for (const sub of trialSubs) {
      items.push({
        id: `trial-${sub.id}`,
        severity: 'warning',
        title: `Trial por vencer · ${sub.restaurant?.name ?? 'Restaurante'}`,
        message: sub.trialEnd
          ? `Expira el ${sub.trialEnd.toLocaleDateString('es-AR')}`
          : 'Trial activo',
        href: sub.restaurant?.id
          ? `/master/restaurants/${sub.restaurant.id}?tab=subscription`
          : undefined,
        createdAt: sub.trialEnd?.toISOString() ?? now.toISOString(),
        category: 'billing',
      });
    }

    const recentAudits = await this.prisma.adminAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: {
        admin: { select: { name: true, email: true } },
        targetRestaurant: { select: { id: true, name: true } },
      },
    });

    for (const log of recentAudits) {
      const actionLabel = formatMasterAuditAction(log.action);
      const targetName = log.targetRestaurant?.name ?? 'Sistema';
      const actor = log.admin?.name ?? log.admin?.email ?? 'Admin';
      items.push({
        id: `audit-${log.id}`,
        severity: log.action.includes('DELETE') ? 'critical' : 'info',
        title: `${actionLabel} · ${targetName}`,
        message: `${actor} ejecutó: ${actionLabel}`,
        href: log.targetRestaurantId
          ? `/master/restaurants/${log.targetRestaurantId}`
          : '/master/audit',
        createdAt: log.createdAt.toISOString(),
        category: 'audit',
      });
    }

    return items
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .slice(0, limit);
  }

  async getSystemObservability() {
    let database: 'connected' | 'disconnected' = 'disconnected';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'connected';
    } catch {
      database = 'disconnected';
    }

    const settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        maintenanceEnabled: true,
        maintenanceMessage: true,
        registrationDisabled: true,
        updatedAt: true,
      },
    });

    const pendingWebhooks = await this.prisma.webhookEvent
      .count({
        where: {
          OR: [{ processedAt: null }, { error: { not: null } }],
        },
      })
      .catch(() => 0);

    const mem = process.memoryUsage();

    return {
      health: {
        status: database === 'connected' ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        services: { database },
        memory: {
          rss: Math.round(mem.rss / 1024 / 1024),
          heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        },
      },
      platform: {
        maintenance: {
          enabled: settings?.maintenanceEnabled ?? false,
          message: settings?.maintenanceMessage ?? null,
        },
        registrationDisabled: settings?.registrationDisabled ?? false,
        updatedAt: settings?.updatedAt?.toISOString() ?? null,
      },
      queues: {
        pendingWebhooks,
        note: 'Colas BullMQ requieren Redis; estado parcial sin Redis.',
      },
    };
  }
}
