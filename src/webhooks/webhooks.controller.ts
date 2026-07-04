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
import { PaymentProviderCredentialsService } from '../payment-providers/payment-provider-credentials.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlanType } from '../subscriptions/dto';
import { PaymentBusinessEventsService } from '../business-events/publishers/payment-business-events.service';

@ApiTags('webhooks')
@Controller()
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly webhookService: MercadoPagoWebhookService,
    private readonly ordersService: OrdersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly paymentProviderFactory: PaymentProviderFactory,
    private readonly credentialsService: PaymentProviderCredentialsService,
    private readonly prisma: PrismaService,
    private readonly paymentEvents: PaymentBusinessEventsService,
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

  @Post(['api/webhooks/mercadopago', 'api/mercadopago/webhooks/mercadopago'])
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Handle MercadoPago payment webhooks (canonical + legacy alias)',
  })
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
    } else if (
      result.checkoutSessionId &&
      result.status &&
      result.status !== 'approved'
    ) {
      await this.publishCheckoutPaymentFailed(
        result.checkoutSessionId,
        result.status,
      );
      await this.webhookService.markWebhookEventProcessed(
        eventKey,
        result.error,
      );
    } else {
      await this.webhookService.markWebhookEventProcessed(
        eventKey,
        result.error,
      );
    }

    return { ...result, duplicate: isDuplicate };
  }

  private async publishCheckoutPaymentFailed(
    checkoutSessionId: string,
    reason: string,
  ): Promise<void> {
    const checkout = await this.prisma.checkoutSession.findUnique({
      where: { id: checkoutSessionId },
      select: { id: true, restaurantId: true, total: true },
    });

    if (!checkout) return;

    this.paymentEvents.publishPaymentFailed({
      restaurantId: checkout.restaurantId,
      checkoutSessionId: checkout.id,
      amount: checkout.total,
      reason,
      source: 'webhooks',
    });
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
      // MP solo envía { type, data: { id } }; hay que hidratar el pago con token de plataforma.
      if (type === 'payment' && paymentId) {
        const payment =
          await this.webhookService.getPaymentDetailsWithPlatformToken(
            String(paymentId),
          );

        if (!payment) {
          this.logger.warn(
            `Subscription webhook: no se pudo hidratar payment ${paymentId}`,
          );
          await this.webhookService.markWebhookEventProcessed(
            eventKey,
            'payment_not_found',
          );
          return { received: true, type, processed: false };
        }

        const externalReference = String(payment.external_reference ?? '');
        const status = String(payment.status ?? '').toLowerCase();
        const amount = Number(payment.transaction_amount ?? 0);

        // external_reference: "sub_restaurantId_PROFESSIONAL"
        if (externalReference.startsWith('sub_')) {
          const parts = externalReference.split('_');
          if (parts.length >= 3) {
            const restaurantId = parts[1];
            const planType = parts[2] as PlanType;

            if (status === 'approved') {
              await this.subscriptionsService.processPaymentApproved(
                restaurantId,
                planType,
                String(paymentId),
                Math.round(amount * 100),
              );
              this.logger.log(
                `Subscription payment approved for restaurant ${restaurantId}`,
              );
            } else if (status === 'rejected') {
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
      // Resolver tenant a partir de site_transaction_id (formato:
      // "order_<checkoutSessionId>" o "sub_<restaurantId>_<planType>") para
      // poder validar la firma con el secret per-tenant.
      const siteTransactionId = body?.site_transaction_id ?? '';
      let tenantWebhookSecret: string | undefined;
      try {
        if (
          typeof siteTransactionId === 'string' &&
          siteTransactionId.startsWith('order_')
        ) {
          const checkoutSessionId = siteTransactionId.replace('order_', '');
          const session = await this.prisma.checkoutSession.findUnique({
            where: { id: checkoutSessionId },
            select: { restaurantId: true },
          });
          if (session) {
            const cred = await this.credentialsService.getDecryptedCredential(
              session.restaurantId,
              'payway',
            );
            if (cred?.webhookSecret) {
              tenantWebhookSecret = cred.webhookSecret;
            }
          }
        } else if (
          typeof siteTransactionId === 'string' &&
          siteTransactionId.startsWith('sub_')
        ) {
          const parts = siteTransactionId.split('_');
          if (parts.length >= 3) {
            const restaurantId = parts[1];
            const cred = await this.credentialsService.getDecryptedCredential(
              restaurantId,
              'payway',
            );
            if (cred?.webhookSecret) {
              tenantWebhookSecret = cred.webhookSecret;
            }
          }
        }
      } catch (lookupErr: any) {
        this.logger.warn(
          `No se pudo resolver tenant para validar firma Payway: ${lookupErr?.message}`,
        );
      }

      if (
        process.env.NODE_ENV === 'production' &&
        !tenantWebhookSecret &&
        !process.env.PAYWAY_WEBHOOK_SECRET?.trim()
      ) {
        throw new ForbiddenException(
          'Payway webhook rejected: missing tenant webhook secret',
        );
      }

      const provider = this.paymentProviderFactory.getProvider('payway');
      const webhook = await provider.validateAndParseWebhook({
        headers,
        rawBody: rawBody || JSON.stringify(body),
        query: {
          ...query,
          ...(tenantWebhookSecret
            ? { __webhookSecret: tenantWebhookSecret }
            : {}),
        },
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
      } else if (webhook.eventType === 'payment') {
        const ref = webhook.externalReference || '';
        if (ref.startsWith('order_')) {
          const checkoutSessionId = ref.replace('order_', '');
          await this.publishCheckoutPaymentFailed(
            checkoutSessionId,
            webhook.status ?? 'failed',
          );
        }
      }

      return { received: true, status: webhook.status };
    } catch (error: any) {
      this.logger.error(`Error processing Payway webhook: ${error.message}`);
      return { received: true, error: error.message };
    }
  }
}
