import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { RedeemPointsDto } from './dto/redeem-points.dto';
import { EnrollLoyaltyDto } from './dto/enroll-loyalty.dto';
import { Public } from '../auth/decorators/public.decorator';
import {
  FeatureGuard,
  RequireFeature,
} from '../subscriptions/guards/feature.guard';

@Controller('api/restaurants/:restaurantId/loyalty')
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  /** Public: consultar puntos por email */
  @Public()
  @Get('account')
  getAccount(
    @Param('restaurantId') restaurantId: string,
    @Query('email') email: string,
  ) {
    return this.loyaltyService.getAccount(restaurantId, email);
  }

  /** Public: consultar puntos de la sesión verificada del cliente */
  @Public()
  @Get('account/me')
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
  enroll(
    @Param('restaurantId') restaurantId: string,
    @Body() body: EnrollLoyaltyDto,
  ) {
    return this.loyaltyService.getOrCreateAccount(restaurantId, body);
  }

  /** Admin: listar cuentas de fidelización */
  @UseGuards(FeatureGuard)
  @RequireFeature('loyalty')
  @Get('accounts')
  listAccounts(
    @Param('restaurantId') restaurantId: string,
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
  getStats(@Param('restaurantId') restaurantId: string) {
    return this.loyaltyService.getStats(restaurantId);
  }

  /** Admin: canjear puntos */
  @UseGuards(FeatureGuard)
  @RequireFeature('loyalty')
  @Post('redeem')
  redeem(
    @Param('restaurantId') restaurantId: string,
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
