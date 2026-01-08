import {
  Controller,
  Post,
  Body,
  Query,
  Req,
  HttpCode,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { MercadoPagoWebhookService } from '../mercadopago/mercadopago-webhook.service';
import { OrdersService } from '../orders/orders.service';

@ApiTags('webhooks')
@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhookService: MercadoPagoWebhookService,
    private readonly ordersService: OrdersService,
  ) {}

  @Post('mercadopago')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle MercadoPago payment webhooks' })
  async handleMercadoPagoWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: { type?: string; 'data.id'?: string },
  ) {
    const rawBody: Buffer | undefined = req?.rawBody;
    const paymentId = query['data.id'] || body?.data?.id;

    this.logger.log(
      `MercadoPago webhook received: type=${query.type}, paymentId=${paymentId}`,
    );

    // Registrar evento para idempotencia
    const { isNew, eventKey } = await this.webhookService.recordWebhookEvent(
      rawBody,
      body,
    );

    const isDuplicate = !isNew;
    if (isDuplicate) {
      this.logger.warn(`Duplicate webhook event (will reprocess): ${eventKey}`);
    }

    // Procesar el webhook
    const result = await this.webhookService.handleWebhook(query, body);

    // Si el pago fue aprobado, procesar con OrdersService
    if (
      result.processed &&
      result.checkoutSessionId &&
      result.status === 'approved'
    ) {
      try {
        await this.ordersService.processCheckoutPaymentApproved(
          result.checkoutSessionId,
          String(paymentId),
        );
        this.logger.log(
          `Payment processed successfully for checkout ${result.checkoutSessionId}`,
        );
      } catch (error: any) {
        this.logger.error(
          `Error processing payment for checkout ${result.checkoutSessionId}: ${error.message}`,
        );
      }
    }

    return { ...result, duplicate: isDuplicate };
  }
}
