import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Req,
  ForbiddenException,
} from '@nestjs/common';

import { Throttle } from '@nestjs/throttler';

import { ConfigService } from '@nestjs/config';

import { Request } from 'express';

import { Public } from '../auth/decorators/public.decorator';

import { CurrentUser } from '../auth/decorators/current-user.decorator';

import type { RequestUser } from '../auth/strategies/jwt.strategy';

import { IsString, IsOptional, ValidateNested } from 'class-validator';

import { Type } from 'class-transformer';

import { PushNotificationService } from './push-notification.service';

import { OwnershipService } from '../common/services/ownership.service';

import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';

import { getClientIp } from '../common/utils/client-ip.util';

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

class PushUnsubscribeDto {
  @IsString()
  endpoint: string;
}

@Controller('api/notifications')
export class PushNotificationsController {
  constructor(
    private readonly config: ConfigService,

    private readonly pushService: PushNotificationService,

    private readonly ownership: OwnershipService,

    private readonly publicWriteAbuse: PublicWriteAbuseService,
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

  @Post('push-subscribe')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async subscribe(
    @Body() dto: PushSubscribeDto,

    @Req() req: Request,

    @Headers('user-agent') userAgent?: string,

    @CurrentUser() user?: RequestUser,
  ) {
    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),

      scope: 'customer_session',

      restaurantId: dto.restaurantId,
    });

    await this.ownership.verifyUserBelongsToRestaurant(
      dto.restaurantId,

      user.userId,
    );

    await this.pushService.subscribe({
      restaurantId: dto.restaurantId,

      userId: user.userId,

      endpoint: dto.subscription.endpoint,

      p256dh: dto.subscription.keys.p256dh,

      auth: dto.subscription.keys.auth,

      userAgent,
    });

    return { subscribed: true };
  }

  @Post('push-unsubscribe')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  async unsubscribe(
    @Body() dto: PushUnsubscribeDto,

    @CurrentUser() user?: RequestUser,
  ) {
    if (!user?.userId) {
      throw new ForbiddenException('Authentication required');
    }

    await this.pushService.unsubscribe(dto.endpoint);

    return { unsubscribed: true };
  }
}
