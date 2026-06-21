import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EdgeLocalServerStatus } from '@prisma/client';
import { AdminAlertsService } from '../admin-alerts/admin-alerts.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  isEdgeServerStale,
  parseEdgeSyncStaleMinutes,
  resolveLastActivityAt,
} from './edge-sync-stale.util';

/**
 * Detecta servidores locales sin actividad de sync reciente y alerta a soporte.
 * Corre en el backend cloud (mismo patrón que payment-reconciliation).
 */
@Injectable()
export class EdgeSyncStaleMonitorService {
  private readonly logger = new Logger(EdgeSyncStaleMonitorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminAlerts: AdminAlertsService,
  ) {}

  @Cron('*/15 * * * *')
  async checkStaleEdgeServers(): Promise<void> {
    const staleMinutes = parseEdgeSyncStaleMinutes(
      process.env.EDGE_SYNC_STALE_MINUTES,
    );
    const staleAfterMs = staleMinutes * 60_000;
    const now = new Date();

    const servers = await this.prisma.edgeLocalServer.findMany({
      where: {
        status: {
          in: [EdgeLocalServerStatus.ACTIVE, EdgeLocalServerStatus.PENDING],
        },
      },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
      },
    });

    if (servers.length === 0) {
      return;
    }

    let markedStale = 0;

    for (const server of servers) {
      if (!isEdgeServerStale(server, staleAfterMs, now)) {
        continue;
      }

      const lastActivity = resolveLastActivityAt(server);
      const minutesSinceActivity = Math.floor(
        (now.getTime() - lastActivity.getTime()) / 60_000,
      );

      await this.prisma.edgeLocalServer.update({
        where: { id: server.id },
        data: { status: EdgeLocalServerStatus.DISCONNECTED },
      });
      markedStale += 1;

      await this.adminAlerts.notifyEdgeSyncStale({
        source: 'edge-sync.stale-monitor',
        restaurantId: server.restaurantId,
        restaurantName: server.restaurant.name,
        restaurantSlug: server.restaurant.slug,
        localId: server.localId,
        hostname: server.hostname,
        lastLanUrl: server.lastLanUrl,
        pendingPushCount: server.pendingPushCount,
        minutesSinceActivity,
        staleThresholdMinutes: staleMinutes,
        lastActivityAt: lastActivity.toISOString(),
      });

      this.logger.warn(
        `Edge local DISCONNECTED: restaurant=${server.restaurant.slug} localId=${server.localId} inactive=${minutesSinceActivity}m`,
      );
    }

    if (markedStale > 0) {
      this.logger.log(
        `Edge sync stale check: ${markedStale}/${servers.length} local(es) marcados DISCONNECTED (umbral ${staleMinutes}m)`,
      );
    }
  }
}
