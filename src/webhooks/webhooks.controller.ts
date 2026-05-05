import {
  Controller,
  Post,
  Body,
  Query,
  Req,
  Headers,
  HttpCode,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { MercadoPagoWebhookService } from '../mercadopago/mercadopago-webhook.service';
import { OrdersService } from '../orders/orders.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { PaymentProviderFactory } from '../payment-providers/payment-provider.factory';
import { PlanType } from '../subscriptions/dto';

@ApiTags('webhooks')
@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhookService: MercadoPagoWebhookService,
    private readonly ordersService: OrdersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
  ) {}

  @Post()
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Compatibility endpoint for legacy MercadoPago webhooks sent to /',
  })
  async handleMercadoPagoRootCompatibilityWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: Record<string, unknown>,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    if (!this.isMercadoPagoWebhookLike(query, body)) {
      throw new NotFoundException('Cannot POST /');
    }

    return this.handleMercadoPagoWebhook(
      req,
      body,
      query as { type?: string; 'data.id'?: string },
      xSignature,
      xRequestId,
    );
  }

  @Post('api/webhooks/mercadopago')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle MercadoPago payment webhooks' })
  async handleMercadoPagoWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: { type?: string; 'data.id'?: string },
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    const rawBody: Buffer | undefined = req?.rawBody;
    const webhookInfo = this.webhookService.extractWebhookInfo(query, body);
    const isLegacyIpn = this.webhookService.isLegacyIpnNotification(
      query,
      body,
    );
    const paymentId = webhookInfo.dataId;
    const eventType = webhookInfo.type || webhookInfo.topic;

    this.logger.log(
      `MercadoPago webhook received: type=${eventType}, paymentId=${paymentId}, queryKeys=${Object.keys(query || {}).join(',') || 'none'}, bodyType=${body?.type || body?.topic || 'unknown'}, source=${isLegacyIpn ? 'legacy_ipn' : 'webhook'}`,
    );

    if (!isLegacyIpn) {
      // Validar firma del webhook (seguridad contra webhooks falsos)
      const signatureValidation = this.webhookService.validateWebhookSignature(
        xSignature,
        xRequestId,
        paymentId,
        rawBody,
      );

      if (!signatureValidation.valid) {
        this.logger.error(
          `Webhook signature validation failed: ${signatureValidation.reason}`,
        );
        throw new ForbiddenException({
          error: 'Invalid webhook signature',
          reason: signatureValidation.reason,
        });
      }
    } else {
      this.logger.log(
        `Skipping signature validation for MercadoPago legacy IPN: topic=${webhookInfo.topic || 'unknown'}, id=${paymentId || 'unknown'}`,
      );
    }

    // Registrar evento para idempotencia
    const { isNew, eventKey } = await this.webhookService.recordWebhookEvent(
      rawBody,
      body,
    );

    const isDuplicate = !isNew;
    if (isDuplicate) {
      this.logger.warn(`Duplicate webhook event ignored: ${eventKey}`);
      return { received: true, duplicate: true };
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
        await this.webhookService.markWebhookEventProcessed(eventKey);
        this.logger.log(
          `Payment processed successfully for checkout ${result.checkoutSessionId}`,
        );
      } catch (error: any) {
        await this.webhookService.markWebhookEventProcessed(
          eventKey,
          error?.message,
        );
        this.logger.error(
          `Error processing payment for checkout ${result.checkoutSessionId}: ${error.message}`,
        );
      }
    } else {
      await this.webhookService.markWebhookEventProcessed(
        eventKey,
        result.error,
      );
    }

    return { ...result, duplicate: isDuplicate };
  }

  private isMercadoPagoWebhookLike(
    query: Record<string, unknown> | undefined,
    body: any,
  ): boolean {
    const extract = (value: unknown): string => {
      if (typeof value === 'string') return value.trim();
      if (typeof value === 'number') return String(value);
      return '';
    };

    const queryType = extract(query?.type);
    const queryTopic = extract(query?.topic);
    const queryDataId = extract(query?.['data.id']);
    const queryId = extract(query?.id);

    const bodyType = extract(body?.type);
    const bodyTopic = extract(body?.topic);
    const bodyDataId = extract(body?.data?.id);
    const bodyId = extract(body?.id);

    const hasTypeLike = !!(queryType || queryTopic || bodyType || bodyTopic);
    const hasIdLike = !!(queryDataId || queryId || bodyDataId || bodyId);

    return hasTypeLike && hasIdLike;
  }

  @Post('api/webhooks/mercadopago/subscription')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle MercadoPago subscription webhooks' })
  async handleSubscriptionWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: { type?: string; 'data.id'?: string },
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    const webhookInfo = this.webhookService.extractWebhookInfo(query, body);
    const isLegacyIpn = this.webhookService.isLegacyIpnNotification(
      query,
      body,
    );
    const paymentId = webhookInfo.dataId;
    const type = webhookInfo.type || webhookInfo.topic;
    const rawBody: Buffer | undefined = req?.rawBody;

    this.logger.log(
      `MercadoPago subscription webhook received: type=${type}, paymentId=${paymentId}`,
    );

    if (!isLegacyIpn) {
      // Validar firma del webhook
      const signatureValidation = this.webhookService.validateWebhookSignature(
        xSignature,
        xRequestId,
        paymentId,
        rawBody,
      );

      if (!signatureValidation.valid) {
        this.logger.error(
          `Subscription webhook signature validation failed: ${signatureValidation.reason}`,
        );
        throw new ForbiddenException({
          error: 'Invalid webhook signature',
          reason: signatureValidation.reason,
        });
      }
    } else {
      this.logger.log(
        `Skipping signature validation for MercadoPago legacy IPN subscription event: topic=${webhookInfo.topic || 'unknown'}, id=${paymentId || 'unknown'}`,
      );
    }

    const { isNew, eventKey } = await this.webhookService.recordWebhookEvent(
      rawBody,
      body,
    );

    if (!isNew) {
      this.logger.warn(`Duplicate subscription webhook ignored: ${eventKey}`);
      return { received: true, duplicate: true, type };
    }

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

      await this.webhookService.markWebhookEventProcessed(eventKey);

      return { received: true, type };
    } catch (error: any) {
      await this.webhookService.markWebhookEventProcessed(
        eventKey,
        error?.message,
      );
      this.logger.error(
        `Error processing subscription webhook: ${error.message}`,
      );
      return { received: true, error: error.message };
    }
  }

  @Post('api/webhooks/payway')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Payway (Decidir) payment webhooks' })
  async handlePaywayWebhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: Record<string, string>,
    @Headers() headers: Record<string, string>,
  ) {
    const rawBody: Buffer | undefined = req?.rawBody;

    this.logger.log(
      `Payway webhook received: paymentId=${body?.id}, status=${body?.status}`,
    );

    try {
      const provider = this.paymentProviderFactory.getProvider('payway');
      const webhook = await provider.validateAndParseWebhook({
        headers,
        rawBody: rawBody || JSON.stringify(body),
        query,
      });

      this.logger.log(
        `Payway webhook parsed: type=${webhook.eventType}, status=${webhook.status}`,
      );

      if (webhook.eventType === 'payment' && webhook.status === 'approved') {
        // externalReference = site_transaction_id (formato: "order_{checkoutSessionId}" o "sub_{restaurantId}_{planType}")
        const ref = webhook.externalReference || '';

        if (ref.startsWith('order_')) {
          const checkoutSessionId = ref.replace('order_', '');
          await this.ordersService.processCheckoutPaymentApproved(
            checkoutSessionId,
            webhook.providerPaymentId,
          );
          this.logger.log(
            `Payway order payment processed for checkout ${checkoutSessionId}`,
          );
        } else if (ref.startsWith('sub_')) {
          const parts = ref.split('_');
          if (parts.length >= 3) {
            const restaurantId = parts[1];
            const planType = parts[2] as PlanType;
            await this.subscriptionsService.processPaymentApproved(
              restaurantId,
              planType,
              webhook.providerPaymentId,
              webhook.amount || 0,
            );
            this.logger.log(
              `Payway subscription payment approved for restaurant ${restaurantId}`,
            );
          }
        }
      }

      return { received: true, status: webhook.status };
    } catch (error: any) {
      this.logger.error(`Error processing Payway webhook: ${error.message}`);
      return { received: true, error: error.message };
    }
  }
}
