import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { LoyaltyService } from './loyalty.service';
import { RedeemPointsDto } from './dto/redeem-points.dto';
import { EnrollLoyaltyDto } from './dto/enroll-loyalty.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  FeatureGuard,
  RequireFeature,
} from '../subscriptions/guards/feature.guard';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { getClientIp } from '../common/utils/client-ip.util';

@Controller('api/restaurants/:restaurantId/loyalty')
export class LoyaltyController {
  constructor(
    private readonly loyaltyService: LoyaltyService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
    private readonly botDefense: BotDefenseService,
  ) {}

  /** Public: consultar puntos por email */
  @Public()
  @Get('account')
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  async getAccount(
    @Param('restaurantId') restaurantId: string,
    @Query('email') email: string,
    @Req() req: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'loyalty_lookup',
      restaurantId,
    });

    return this.loyaltyService.getAccount(restaurantId, email);
  }

  /** Public: consultar puntos de la sesión verificada del cliente */
  @Public()
  @Get('account/me')
  @Throttle({ default: { ttl: 60_000, limit: 40 } })
  getOwnAccount(
    @Param('restaurantId') restaurantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.loyaltyService.getAccountForSession(
      restaurantId,
      authorization,
    );
  }

  /** Public: registrarse en programa de fidelización */
  @Public()
  @Post('enroll')
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  async enroll(
    @Param('restaurantId') restaurantId: string,
    @Body() body: EnrollLoyaltyDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(body.companyWebsite)) {
      this.botDefense.logHoneypotHit('loyalty.enroll', { restaurantId });
      await this.botDefense.applyBotDelayMs();
      return this.loyaltyService.buildDecoyEnrollment(restaurantId, body);
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'loyalty_lookup',
      restaurantId,
    });

    return this.loyaltyService.getOrCreateAccount(restaurantId, body);
  }

  /** Admin: listar cuentas de fidelización */
  @UseGuards(FeatureGuard)
  @RequireFeature('loyalty')
  @Get('accounts')
  listAccounts(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.loyaltyService.listAccounts(
      restaurantId,
      page ? parseInt(page, 10) : 1,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /** Admin: stats del programa */
  @UseGuards(FeatureGuard)
  @RequireFeature('loyalty')
  @Get('stats')
  getStats(@VerifyRestaurantAccess('restaurantId') restaurantId: string) {
    return this.loyaltyService.getStats(restaurantId);
  }

  /** Admin: canjear puntos */
  @UseGuards(FeatureGuard)
  @RequireFeature('loyalty')
  @Post('redeem')
  redeem(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() dto: RedeemPointsDto,
  ) {
    return this.loyaltyService.redeemPoints(
      restaurantId,
      dto.customerEmail,
      dto.points,
      dto.description,
      dto.orderId,
    );
  }
}
