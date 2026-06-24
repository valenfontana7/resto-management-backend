import { Controller, Post, Body, Param, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/coupon.dto';
import { Public } from '../auth/decorators/public.decorator';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';

@Controller('api/public/restaurants/:restaurantId/coupons')
export class PublicCouponsController {
  constructor(
    private readonly couponsService: CouponsService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Public()
  @Post('validate')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async validate(
    @Param('restaurantId') restaurantId: string,
    @Body() validateDto: ValidateCouponDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(validateDto.companyWebsite)) {
      this.botDefense.logHoneypotHit('coupons.validate', { restaurantId });
      await this.botDefense.applyBotDelayMs();
      return {
        valid: false,
        discountAmount: 0,
        message: 'Cupón no válido',
      };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'coupon_validate',
      restaurantId,
    });

    const result = await this.couponsService.validate(
      restaurantId,
      validateDto,
    );
    return {
      valid: result.valid,
      discountAmount: result.discountAmount,
      message: result.message,
    };
  }
}
