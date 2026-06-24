import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  HttpCode,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';

import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';

import { PaymentsService } from './payments.service';

import { Public } from '../auth/decorators/public.decorator';

@ApiTags('payments')
@Controller('api/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Public()
  @Post('create-preference/:orderId')
  @HttpCode(410)
  @ApiOperation({ summary: 'Deprecated MercadoPago preference endpoint' })
  @ApiResponse({ status: 410, description: 'Endpoint deprecated' })
  createPreference() {
    throw new GoneException(
      'Deprecated endpoint. Use checkout flow via POST /api/restaurants/:id/orders or POST /api/mercadopago/preference with publicTrackingToken',
    );
  }

  @Post('webhook')
  @Public()
  @HttpCode(410)
  @ApiOperation({ summary: 'Deprecated MercadoPago webhook endpoint' })
  @ApiResponse({ status: 410, description: 'Endpoint deprecated' })
  handleWebhook() {
    throw new GoneException(
      'Deprecated webhook endpoint. Configure MercadoPago to use /api/webhooks/mercadopago',
    );
  }

  @Public()
  @Get('status/:orderId')
  @ApiOperation({ summary: 'Get payment status for an order (token required)' })
  @ApiQuery({ name: 'token', required: true })
  @ApiResponse({ status: 200, description: 'Payment status retrieved' })
  async getPaymentStatus(
    @Param('orderId') orderId: string,

    @Query('token') token?: string,
  ) {
    if (!token?.trim()) {
      throw new UnauthorizedException('Token de pedido requerido');
    }

    return this.paymentsService.getPaymentStatus(orderId, token);
  }
}
