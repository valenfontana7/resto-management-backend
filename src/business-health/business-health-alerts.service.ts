import { Injectable, Logger } from '@nestjs/common';
import {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { buildGrowthActions } from './business-health.utils';

export interface BusinessHealthAlertSnapshot {
  periodDays: number;
  margin: {
    dishesWithoutCostCount: number;
    lowMarginAlerts: Array<{ name: string; marginPercent: number | null }>;
  };
  inventory: {
    lowStockItems: Array<{ name: string }>;
  };
  commercial: {
    onlineSharePercent: number;
  };
  growth: {
    inactiveCustomers: Array<{ name: string; daysInactive: number }>;
  };
}

interface AlertDefinition {
  key: string;
  title: string;
  message: string;
  href: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
}

@Injectable()
export class BusinessHealthAlertsService {
  private readonly logger = new Logger(BusinessHealthAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async syncFromDashboard(
    restaurantId: string,
    snapshot: BusinessHealthAlertSnapshot,
  ): Promise<void> {
    const recipients = await this.getRecipients(restaurantId);
    if (recipients.length === 0) return;

    const alerts = this.buildAlerts(snapshot);
    if (alerts.length === 0) return;

    const dayKey = new Date().toISOString().slice(0, 10);

    for (const userId of recipients) {
      for (const alert of alerts) {
        const alreadySent = await this.wasSentToday(
          userId,
          restaurantId,
          alert.key,
          dayKey,
        );
        if (alreadySent) continue;

        try {
          await this.notifications.createAndSend({
            userId,
            restaurantId,
            type: NotificationType.CUSTOM,
            title: alert.title,
            message: alert.message,
            priority: alert.priority,
            channels: alert.channels,
            data: {
              alertKey: alert.key,
              dayKey,
              href: alert.href,
              url: alert.href,
            },
          });
        } catch (error) {
          this.logger.warn(
            `No se pudo enviar alerta ${alert.key} a ${userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  private buildAlerts(
    snapshot: BusinessHealthAlertSnapshot,
  ): AlertDefinition[] {
    const alerts: AlertDefinition[] = [];

    if (snapshot.inventory.lowStockItems.length > 0) {
      const count = snapshot.inventory.lowStockItems.length;
      const sample = snapshot.inventory.lowStockItems
        .slice(0, 2)
        .map((item) => item.name)
        .join(', ');
      alerts.push({
        key: 'business-health:low-stock',
        title: `${count} insumo(s) en quiebre`,
        message:
          count === 1
            ? `${sample} está por debajo del mínimo.`
            : `${sample}${count > 2 ? ' y otros' : ''} requieren reposición.`,
        href: '/admin/salud#inventario',
        priority: NotificationPriority.HIGH,
        channels: [NotificationChannel.IN_APP, NotificationChannel.PUSH],
      });
    }

    if (snapshot.margin.dishesWithoutCostCount > 0) {
      alerts.push({
        key: 'business-health:missing-costs',
        title: `${snapshot.margin.dishesWithoutCostCount} plato(s) sin costo`,
        message:
          'Completá costos estimados en el menú para decisiones semanales de margen.',
        href: '/admin/menu',
        priority: NotificationPriority.NORMAL,
        channels: [NotificationChannel.IN_APP],
      });
    }

    if (snapshot.margin.lowMarginAlerts.length > 0) {
      const dish = snapshot.margin.lowMarginAlerts[0];
      alerts.push({
        key: 'business-health:low-margin',
        title: `Revisar margen de "${dish.name}"`,
        message: `Margen ${dish.marginPercent ?? '—'}% con ventas activas — evaluá precio o costo.`,
        href: '/admin/salud',
        priority: NotificationPriority.NORMAL,
        channels: [NotificationChannel.IN_APP],
      });
    }

    const growthActions = buildGrowthActions({
      onlineShare: snapshot.commercial.onlineSharePercent,
      inactiveCustomers: snapshot.growth.inactiveCustomers,
      dishesWithoutCost: snapshot.margin.dishesWithoutCostCount,
      lowStockCount: snapshot.inventory.lowStockItems.length,
    });

    const directChannel = growthActions.find(
      (action) => action.id === 'direct-channel',
    );
    if (directChannel) {
      alerts.push({
        key: 'business-health:direct-channel',
        title: directChannel.title,
        message: directChannel.detail,
        href: directChannel.href,
        priority: NotificationPriority.NORMAL,
        channels: [NotificationChannel.IN_APP],
      });
    }

    return alerts;
  }

  private async getRecipients(restaurantId: string): Promise<string[]> {
    const memberships = await this.prisma.restaurantMembership.findMany({
      where: {
        restaurantId,
        user: { isActive: true },
      },
      select: {
        userId: true,
        role: { select: { name: true } },
        user: { select: { role: { select: { name: true } } } },
      },
    });

    const allowed = new Set(['OWNER', 'MANAGER', 'ADMIN']);
    const ids = new Set<string>();

    for (const membership of memberships) {
      const roleName =
        membership.role?.name ?? membership.user.role?.name ?? null;
      if (roleName && allowed.has(roleName)) {
        ids.add(membership.userId);
      }
    }

    return [...ids];
  }

  private async wasSentToday(
    userId: string,
    restaurantId: string,
    alertKey: string,
    dayKey: string,
  ): Promise<boolean> {
    const start = new Date(`${dayKey}T00:00:00.000Z`);
    const end = new Date(`${dayKey}T23:59:59.999Z`);

    const existing = await this.prisma.notification.findFirst({
      where: {
        userId,
        restaurantId,
        type: NotificationType.CUSTOM,
        createdAt: { gte: start, lte: end },
        data: {
          path: ['alertKey'],
          equals: alertKey,
        },
      },
      select: { id: true },
    });

    return Boolean(existing);
  }
}
