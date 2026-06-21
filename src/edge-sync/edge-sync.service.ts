import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EdgeLocalServerStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  generateEdgeLocalId,
  generateEdgeSyncToken,
  hashEdgeSyncToken,
  verifyEdgeSyncToken,
} from './edge-sync.crypto';
import {
  EdgeHeartbeatDto,
  EdgeRegisterDto,
  EdgeSyncPushDto,
} from './dto/edge-sync.dto';
import {
  isEdgeServerStale,
  parseEdgeSyncStaleMinutes,
  resolveLastActivityAt,
} from './edge-sync-stale.util';

@Injectable()
export class EdgeSyncService {
  private readonly logger = new Logger(EdgeSyncService.name);

  constructor(private readonly prisma: PrismaService) {}

  async registerLocalServer(
    restaurantId: string,
    dto: EdgeRegisterDto,
  ): Promise<{
    localId: string;
    edgeSyncToken: string;
    restaurantId: string;
  }> {
    const edgeSyncToken = generateEdgeSyncToken();
    const syncTokenHash = hashEdgeSyncToken(edgeSyncToken);
    const localId = dto.localId?.trim() || generateEdgeLocalId();

    const record = await this.prisma.edgeLocalServer.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        localId,
        syncTokenHash,
        hostname: dto.hostname?.trim() || null,
        version: dto.version?.trim() || null,
        status: EdgeLocalServerStatus.ACTIVE,
        lastHeartbeatAt: new Date(),
      },
      update: {
        localId,
        syncTokenHash,
        hostname: dto.hostname?.trim() || null,
        version: dto.version?.trim() || null,
        status: EdgeLocalServerStatus.ACTIVE,
        lastHeartbeatAt: new Date(),
      },
    });

    this.logger.log(
      `Edge server registered for restaurant ${restaurantId} (${record.localId})`,
    );

    return { localId: record.localId, edgeSyncToken, restaurantId };
  }

  async validateEdgeCredentials(
    restaurantId: string,
    localId: string,
    token: string,
  ): Promise<boolean> {
    const record = await this.prisma.edgeLocalServer.findUnique({
      where: { restaurantId },
    });
    if (!record || record.localId !== localId) return false;
    return verifyEdgeSyncToken(token, record.syncTokenHash);
  }

  async heartbeat(
    restaurantId: string,
    localId: string,
    dto: EdgeHeartbeatDto,
  ) {
    const record = await this.requireEdgeServer(restaurantId, localId);
    return this.prisma.edgeLocalServer.update({
      where: { id: record.id },
      data: {
        lastHeartbeatAt: new Date(),
        lastLanUrl: dto.lanUrl?.trim() || record.lastLanUrl,
        version: dto.version?.trim() || record.version,
        status: EdgeLocalServerStatus.ACTIVE,
      },
    });
  }

  async pull(
    restaurantId: string,
    localId: string,
    streamsRaw?: string,
    since?: string,
  ) {
    await this.requireEdgeServer(restaurantId, localId);
    const streams = (streamsRaw ?? 'menu,tables,settings')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const now = new Date();
    await this.prisma.edgeLocalServer.update({
      where: { restaurantId },
      data: { lastSyncPullAt: now, status: EdgeLocalServerStatus.ACTIVE },
    });

    // MVP: estructura de delta vacía; Fase 2 llena menu/tables desde Prisma.
    const streamPayload: Record<
      string,
      { items: unknown[]; cursor: string; since: string | null }
    > = {};
    for (const stream of streams) {
      const cursor = await this.prisma.edgeSyncCursor.findUnique({
        where: {
          restaurantId_localId_streamKey: {
            restaurantId,
            localId,
            streamKey: stream,
          },
        },
      });
      streamPayload[stream] = {
        items: [],
        cursor: cursor?.cursorValue ?? now.toISOString(),
        since: since ?? null,
      };
    }

    return {
      restaurantId,
      localId,
      serverTime: now.toISOString(),
      streams: streamPayload,
    };
  }

  async push(restaurantId: string, localId: string, dto: EdgeSyncPushDto) {
    await this.requireEdgeServer(restaurantId, localId);
    const accepted: string[] = [];
    const rejected: { clientMutationId: string; reason: string }[] = [];

    for (const mutation of dto.mutations ?? []) {
      if (!mutation.clientMutationId?.trim()) {
        rejected.push({
          clientMutationId: mutation.clientMutationId ?? '',
          reason: 'missing_clientMutationId',
        });
        continue;
      }
      // MVP: ack idempotente; Fase 2 aplica mutaciones floor en cloud.
      accepted.push(mutation.clientMutationId.trim());
    }

    await this.prisma.edgeLocalServer.update({
      where: { restaurantId },
      data: {
        lastSyncPushAt: new Date(),
        pendingPushCount: Math.max(0, rejected.length),
        status: EdgeLocalServerStatus.ACTIVE,
      },
    });

    this.logger.debug(
      `Edge push ${restaurantId}: accepted=${accepted.length} rejected=${rejected.length}`,
    );

    return { accepted, rejected, serverTime: new Date().toISOString() };
  }

  async getStatus(restaurantId: string) {
    const record = await this.prisma.edgeLocalServer.findUnique({
      where: { restaurantId },
    });
    if (!record) {
      throw new NotFoundException('No edge server registered');
    }

    const staleMinutes = parseEdgeSyncStaleMinutes(
      process.env.EDGE_SYNC_STALE_MINUTES,
    );
    const lastActivityAt = resolveLastActivityAt(record);
    const staleAfterMs = staleMinutes * 60_000;
    const isStale = isEdgeServerStale(record, staleAfterMs);

    return {
      restaurantId,
      localId: record.localId,
      status: record.status,
      hostname: record.hostname,
      version: record.version,
      lastHeartbeatAt: record.lastHeartbeatAt?.toISOString() ?? null,
      lastLanUrl: record.lastLanUrl,
      lastSyncPullAt: record.lastSyncPullAt?.toISOString() ?? null,
      lastSyncPushAt: record.lastSyncPushAt?.toISOString() ?? null,
      pendingPushCount: record.pendingPushCount,
      lastActivityAt: lastActivityAt.toISOString(),
      staleThresholdMinutes: staleMinutes,
      isStale,
    };
  }

  private async requireEdgeServer(restaurantId: string, localId: string) {
    const record = await this.prisma.edgeLocalServer.findUnique({
      where: { restaurantId },
    });
    if (!record) {
      throw new NotFoundException('Edge server not registered');
    }
    if (record.localId !== localId) {
      throw new ForbiddenException('Local id mismatch');
    }
    return record;
  }
}
