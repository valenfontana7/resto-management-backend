import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';
import { RedisThrottlerStorage } from './redis-throttler.storage';
import { parseRedisUrl } from './redis-connection.util';

const logger = new Logger('RedisModule');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        const redisUrl = config.get<string>('REDIS_URL')?.trim();
        if (!redisUrl) return null;

        const client = new Redis({
          ...parseRedisUrl(redisUrl),
          lazyConnect: true,
        });

        client.on('error', (error) => {
          logger.warn(`Redis client error: ${error.message}`);
        });

        void client.connect().catch((error) => {
          logger.warn(
            `Redis connect failed, falling back to in-memory limits: ${error.message}`,
          );
        });

        return client;
      },
    },
    RedisThrottlerStorage,
  ],
  exports: [REDIS_CLIENT, RedisThrottlerStorage],
})
export class RedisModule {}
