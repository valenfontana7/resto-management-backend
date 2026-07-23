import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ImpulsaCheckoutService } from './impulsa-checkout.service';

@ApiTags('Impulsa (Public)')
@Public()
@Controller('api/public/impulsa')
export class ImpulsaPublicController {
  constructor(private readonly impulsaCheckout: ImpulsaCheckoutService) {}

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary:
      'Crear checkout MercadoPago para Activación local (mismo token que suscripción Bentoo)',
  })
  createCheckout() {
    return this.impulsaCheckout.createCheckout();
  }
}
