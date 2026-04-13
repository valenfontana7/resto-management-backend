import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { EmailService } from './email.service';
import { EmailProcessor, EMAIL_QUEUE } from './email.processor';

const redisAvailable = !!process.env.REDIS_URL;

@Module({
  imports: [
    ConfigModule,
    ...(redisAvailable
      ? [BullModule.registerQueue({ name: EMAIL_QUEUE })]
      : []),
  ],
  providers: [EmailService, ...(redisAvailable ? [EmailProcessor] : [])],
  exports: [EmailService],
})
export class EmailModule {}
