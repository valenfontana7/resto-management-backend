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
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PlanType } from '../subscriptions/dto';

@ApiTags('webhooks')
@Controller('api/webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhookService: MercadoPagoWebhookService,
    private readonly ordersService: OrdersService,
    private readonly subscriptionsService: SubscriptionsService,
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

  @Post('mercadopago/subscription')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle MercadoPago subscription webhooks' })
  async handleSubscriptionWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: { type?: string; 'data.id'?: string },
  ) {
    const paymentId = query['data.id'] || body?.data?.id;
    const type = query.type || body?.type;

    this.logger.log(
      `MercadoPago subscription webhook received: type=${type}, paymentId=${paymentId}`,
    );

    try {
      // Manejar eventos de pago de suscripción
      if (type === 'payment') {
        const externalReference = body?.data?.external_reference || '';

        // external_reference: "sub_restaurantId_PROFESSIONAL"
        if (externalReference.startsWith('sub_')) {
          const parts = externalReference.split('_');
          if (parts.length >= 3) {
            const restaurantId = parts[1];
            const planType = parts[2] as PlanType;
            const status = body?.data?.status;
            const amount = body?.data?.transaction_amount;

            if (status === 'approved') {
              await this.subscriptionsService.processPaymentApproved(
                restaurantId,
                planType,
                String(paymentId),
                Math.round((amount || 0) * 100), // Convertir a centavos
              );
              this.logger.log(
                `Subscription payment approved for restaurant ${restaurantId}`,
              );
            } else if (status === 'rejected') {
              // Marcar como pago vencido
              const subscription =
                await this.subscriptionsService.getSubscription(restaurantId);
              if (subscription.subscription) {
                await this.subscriptionsService.markAsPastDue(
                  subscription.subscription.id,
                );
              }
              this.logger.warn(
                `Subscription payment rejected for restaurant ${restaurantId}`,
              );
            }
          }
        }
      }

      return { received: true, type };
    } catch (error: any) {
      this.logger.error(
        `Error processing subscription webhook: ${error.message}`,
      );
      return { received: true, error: error.message };
    }
  }
}
