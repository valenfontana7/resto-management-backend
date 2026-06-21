import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';
import { isLocalMode } from './common/config/bentoo-mode.config';
import { LocalDiscoveryService } from './local-discovery/local-discovery.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Optional() private readonly localDiscovery?: LocalDiscoveryService,
  ) {}

  getHello(): string {
    return 'Hello World!';
  }

  async healthCheck() {
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();
    const mem = process.memoryUsage();

    return {
      status: dbStatus ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      bentooMode: isLocalMode() ? 'local' : 'cloud',
      version: process.env.npm_package_version || '0.0.1',
      services: {
        database: dbStatus ? 'connected' : 'disconnected',
        redis: redisStatus,
        ...(isLocalMode() && this.localDiscovery
          ? {
              lanDiscovery: {
                advertisedUrl: this.localDiscovery.getAdvertisedServerUrl(),
                udpPort:
                  this.config.get<string>('BENTOO_DISCOVERY_PORT') ?? '40200',
              },
            }
          : {}),
      },
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
    };
  }

  async getSystemStatus() {
    const settings = await this.prisma.systemSettings.findFirst({
      orderBy: { updatedAt: 'desc' },
      select: {
        maintenanceEnabled: true,
        maintenanceMessage: true,
        updatedAt: true,
      },
    });

    return {
      maintenance: {
        enabled: settings?.maintenanceEnabled ?? false,
        message:
          settings?.maintenanceMessage?.trim() ||
          'El sistema esta en mantenimiento. Intenta nuevamente en unos minutos.',
      },
      updatedAt: settings?.updatedAt?.toISOString?.() ?? null,
      timestamp: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<string> {
    const redisUrl = this.config.get<string>('REDIS_URL');
    if (!redisUrl) return 'not_configured';
    try {
      const { default: Redis } = await import('ioredis');
      const client = new Redis(redisUrl, {
        connectTimeout: 2000,
        lazyConnect: true,
      });
      await client.connect();
      await client.ping();
      await client.quit();
      return 'connected';
    } catch {
      return 'disconnected';
    }
  }
}
