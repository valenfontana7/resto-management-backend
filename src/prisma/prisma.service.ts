import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private pool: Pool;
  private readonly timezone =
    process.env.APP_TIMEZONE || 'America/Argentina/Buenos_Aires';

  constructor() {
    const poolMax = Number(process.env.PG_POOL_MAX || 10);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number.isFinite(poolMax) && poolMax > 0 ? poolMax : 10,
    });
    const adapter = new PrismaPg(pool);
    const jsonStdoutMode = process.env.BENTOO_LAB_JSON_STDOUT === 'true';
    // Query logging opt-in: cada poll de outbox/cron spamea SELECTs enormes y
    // hincha CPU/RAM del proceso + del terminal (concurrently). Activar con
    // PRISMA_LOG_QUERIES=true solo cuando se diagnostique SQL.
    const logQueries =
      process.env.PRISMA_LOG_QUERIES === 'true' ||
      process.env.PRISMA_LOG_QUERIES === '1';

    super({
      adapter,
      log: jsonStdoutMode
        ? []
        : logQueries
          ? ['query', 'error', 'warn']
          : process.env.NODE_ENV === 'development'
            ? ['error', 'warn']
            : ['error'],
    });

    this.pool = pool;
    const timezone = this.timezone.replace(/'/g, "''");
    this.pool.on('connect', (client) => {
      void client.query(`SET TIME ZONE '${timezone}'`);
    });
  }

  async onModuleInit() {
    await this.$connect();
    await this.$executeRawUnsafe(`SET TIME ZONE '${this.timezone}'`);
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end();
  }

  // Helper para limpiar datos en tests
  async cleanDatabase() {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('cleanDatabase only available in test environment');
    }

    const models = Object.keys(this).filter(
      (key) =>
        !key.startsWith('_') &&
        !key.startsWith('$') &&
        typeof this[key] === 'object',
    );

    return Promise.all(models.map((model) => this[model].deleteMany()));
  }
}
