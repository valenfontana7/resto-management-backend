import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isLocalMode } from '../common/config/bentoo-mode.config';
import { buildLocalServerAdvertisedUrl } from '../local-discovery/lan-ip.util';

@Injectable()
export class EdgeSyncWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EdgeSyncWorkerService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly config: ConfigService) {}

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

  private async tick(): Promise<void> {
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
      const lanUrl = buildLocalServerAdvertisedUrl(
        Number(this.config.get('PORT') ?? 4000),
        this.config.get('BENTOO_DISCOVERY_HOST'),
      );

      await fetch(`${base}/api/restaurants/${restaurantId}/edge/heartbeat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: 'local-mvp', lanUrl }),
      });

      const pullUrl = `${base}/api/restaurants/${restaurantId}/edge/sync/pull?streams=menu,tables,floor_sessions,settings`;
      const pullRes = await fetch(pullUrl, { headers });
      if (!pullRes.ok) {
        this.logger.warn(`Edge pull failed: HTTP ${pullRes.status}`);
        return;
      }

      // MVP: push vacío; Fase 2 lee sync_outbox local.
      await fetch(`${base}/api/restaurants/${restaurantId}/edge/sync/push`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ mutations: [] }),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.debug(`Edge sync tick skipped: ${message}`);
    }
  }
}
