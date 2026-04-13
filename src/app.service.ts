import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma/prisma.service';

@Injectable()
export class AppService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
      version: process.env.npm_package_version || '0.0.1',
      services: {
        database: dbStatus ? 'connected' : 'disconnected',
        redis: redisStatus,
      },
      memory: {
        rss: Math.round(mem.rss / 1024 / 1024),
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
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
