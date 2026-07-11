import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLocalMode } from '../common/config/bentoo-mode.config';
import { buildLocalServerAdvertisedUrl } from '../local-discovery/lan-ip.util';
import { EdgeSyncOutboxService } from './edge-sync-outbox.service';
import {
  EdgeSyncPullApplyService,
  type EdgePullStreams,
} from './edge-sync-pull-apply.service';

@Injectable()
export class EdgeSyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EdgeSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;

  constructor(
    private readonly config: ConfigService,
    private readonly pullApply: EdgeSyncPullApplyService,
    private readonly outbox: EdgeSyncOutboxService,
  ) {}

  onModuleInit(): void {
    if (!isLocalMode()) return;
    if (this.config.get('EDGE_SYNC_WORKER') === 'false') return;

    const intervalMs = Number(
      this.config.get('EDGE_SYNC_INTERVAL_MS') ?? 30_000,
    );
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    void this.tick();
    this.logger.log(`Edge sync worker started (every ${intervalMs}ms)`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;

    try {
      await this.runTick();
    } finally {
      this.ticking = false;
    }
  }

  private async runTick(): Promise<void> {
    const cloudUrl = this.config.get<string>('CLOUD_API_URL')?.trim();
    const token = this.config.get<string>('EDGE_SYNC_TOKEN')?.trim();
    const localId = this.config.get<string>('EDGE_LOCAL_ID')?.trim();
    const restaurantId = this.config.get<string>('RESTAURANT_ID')?.trim();

    if (!cloudUrl || !token || !localId || !restaurantId) {
      return;
    }

    const base = cloudUrl.replace(/\/$/, '');
    const headers = {
      Authorization: `Bearer ${token}`,
      'X-Bentoo-Local-Id': localId,
      'Content-Type': 'application/json',
    };

    try {
      await this.outbox.resetSyncingToPending(restaurantId);

      const lanUrl = buildLocalServerAdvertisedUrl(
        Number(this.config.get('PORT') ?? 4000),
        this.config.get('BENTOO_DISCOVERY_HOST'),
      );

      await fetch(`${base}/api/restaurants/${restaurantId}/edge/heartbeat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: 'local-mvp', lanUrl }),
      });

      const cursors = await this.pullApply.getCursorMap(restaurantId);
      const sinceParam = this.buildSinceQuery(cursors);
      const pullUrl = `${base}/api/restaurants/${restaurantId}/edge/sync/pull?streams=menu,tables,floor_sessions,settings${sinceParam}`;
      const pullRes = await fetch(pullUrl, { headers });
      if (!pullRes.ok) {
        this.logger.warn(`Edge pull failed: HTTP ${pullRes.status}`);
        return;
      }

      const pullBody = (await pullRes.json()) as { streams?: EdgePullStreams };
      const streams = pullBody.streams ?? {};
      const applied = await this.pullApply.applyStreams(restaurantId, streams);
      await this.pullApply.saveCursors(restaurantId, streams);
      if (applied.applied.length > 0) {
        this.logger.debug(
          `Edge pull applied streams: ${applied.applied.join(', ')}`,
        );
      }

      await this.pushPendingOutbox(base, restaurantId, localId, headers);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Edge sync tick skipped: ${message}`);
    }
  }

  private buildSinceQuery(cursors: Record<string, string>): string {
    const values = Object.values(cursors).filter(Boolean);
    if (values.length === 0) return '';
    const oldest = values.sort()[0];
    return oldest ? `&since=${encodeURIComponent(oldest)}` : '';
  }

  private async pushPendingOutbox(
    base: string,
    restaurantId: string,
    localId: string,
    headers: Record<string, string>,
  ) {
    const pending = await this.outbox.listPending(restaurantId);
    if (pending.length === 0) {
      await fetch(`${base}/api/restaurants/${restaurantId}/edge/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mutations: [] }),
      });
      return;
    }

    await this.outbox.markSyncing(pending.map((row) => row.id));

    const pushRes = await fetch(
      `${base}/api/restaurants/${restaurantId}/edge/sync/push`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mutations: pending.map((row) => ({
            clientMutationId: row.clientMutationId,
            entityType: row.entityType,
            payload: row.payload as Record<string, unknown>,
          })),
        }),
      },
    );

    if (!pushRes.ok) {
      this.logger.warn(`Edge push failed: HTTP ${pushRes.status}`);
      await this.outbox.resetSyncingToPending(restaurantId);
      return;
    }

    const pushBody = (await pushRes.json()) as {
      accepted?: string[];
      rejected?: Array<{ clientMutationId: string; reason: string }>;
    };

    for (const clientMutationId of pushBody.accepted ?? []) {
      await this.outbox.markCompleted(restaurantId, clientMutationId);
    }

    for (const rejected of pushBody.rejected ?? []) {
      await this.outbox.markFailed(
        restaurantId,
        rejected.clientMutationId,
        rejected.reason,
      );
    }

    const acceptedSet = new Set(pushBody.accepted ?? []);
    for (const row of pending) {
      if (acceptedSet.has(row.clientMutationId)) continue;
      const explicitReject = pushBody.rejected?.find(
        (item) => item.clientMutationId === row.clientMutationId,
      );
      if (!explicitReject) {
        await this.outbox.markFailed(
          restaurantId,
          row.clientMutationId,
          'not_accepted_by_cloud',
        );
      }
    }
  }
}
