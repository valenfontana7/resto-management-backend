import { Controller, Get, Post, Body } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

class PushSubscriptionDto {
  @IsString()
  endpoint: string;

  @IsOptional()
  @IsString()
  expirationTime?: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}

class PushSubscribeDto {
  @IsString()
  restaurantId: string;

  @ValidateNested()
  @Type(() => PushSubscriptionDto)
  subscription: PushSubscriptionDto;
}

@Controller('notifications')
export class PushNotificationsController {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    if (!publicKey) {
      return { publicKey: null, enabled: false };
    }
    return { publicKey, enabled: true };
  }

  @Public()
  @Post('push-subscribe')
  async subscribe(@Body() dto: PushSubscribeDto) {
    // Store subscription as JSON in Analytics model for simplicity
    // In production, consider a dedicated PushSubscription table
    await this.prisma.analytics.create({
      data: {
        restaurantId: dto.restaurantId,
        metric: 'push_subscription',
        value: 1,
        metadata: {
          endpoint: dto.subscription.endpoint,
          keys: {
            p256dh: dto.subscription.keys.p256dh,
            auth: dto.subscription.keys.auth,
          },
        } as any,
      },
    });

    return { subscribed: true };
  }
}
