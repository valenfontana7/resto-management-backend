import { Controller, Get, Post, Body, Headers, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { IsString, IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PushNotificationService } from './push-notification.service';

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

  @IsOptional()
  @IsString()
  userId?: string;

  @ValidateNested()
  @Type(() => PushSubscriptionDto)
  subscription: PushSubscriptionDto;
}

class PushUnsubscribeDto {
  @IsString()
  endpoint: string;
}

@Controller('api/notifications')
export class PushNotificationsController {
  constructor(
    private readonly config: ConfigService,
    private readonly pushService: PushNotificationService,
  ) {}

  @Public()
  @Get('vapid-public-key')
  getVapidPublicKey() {
    const publicKey = this.config.get<string>('VAPID_PUBLIC_KEY');
    if (!publicKey) {
      return { publicKey: null, enabled: false };
    }
    return { publicKey, enabled: this.pushService.isEnabled() };
  }

  @Public()
  @Post('push-subscribe')
  async subscribe(
    @Body() dto: PushSubscribeDto,
    @Req() req: Request,
    @Headers('user-agent') userAgent?: string,
  ) {
    const userId = dto.userId ?? (req as any).user?.id ?? null;

    await this.pushService.subscribe({
      restaurantId: dto.restaurantId,
      userId,
      endpoint: dto.subscription.endpoint,
      p256dh: dto.subscription.keys.p256dh,
      auth: dto.subscription.keys.auth,
      userAgent,
    });

    return { subscribed: true };
  }

  @Public()
  @Post('push-unsubscribe')
  async unsubscribe(@Body() dto: PushUnsubscribeDto) {
    await this.pushService.unsubscribe(dto.endpoint);
    return { unsubscribed: true };
  }
}
