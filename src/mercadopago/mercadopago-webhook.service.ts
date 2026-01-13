import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import * as crypto from 'crypto';

export interface WebhookProcessResult {
  received: boolean;
  processed?: boolean;
  checkoutSessionId?: string;
  status?: string;
  error?: string;
}

@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoPagoCredentialsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Valida la firma HMAC del webhook de MercadoPago
   * Retorna true si la firma es válida o si no está configurado el secret (modo desarrollo)
   * @see https://www.mercadopago.com.ar/developers/es/docs/notifications/webhooks
   */
  validateWebhookSignature(
    xSignature: string | undefined,
    xRequestId: string | undefined,
    dataId: string | undefined,
    rawBody?: Buffer,
  ): { valid: boolean; reason?: string } {
    const webhookSecret = this.configService.get<string>(
      'MERCADOPAGO_WEBHOOK_SECRET',
    );

    // Si no hay secret configurado, skip validación (desarrollo)
    if (!webhookSecret) {
      this.logger.warn(
        'MERCADOPAGO_WEBHOOK_SECRET not configured - webhook signature validation skipped (unsafe for production)',
      );
      return { valid: true, reason: 'no_secret_configured' };
    }

    if (!xSignature) {
      return { valid: false, reason: 'missing_x_signature_header' };
    }

    // Parsear el header x-signature (formato: ts=xxx,v1=xxx)
    const parts: Record<string, string> = {};
    xSignature.split(',').forEach((part) => {
      const [key, value] = part.split('=');
      if (key && value) parts[key.trim()] = value.trim();
    });

    const ts = parts['ts'];
    const v1 = parts['v1'];

    if (!ts || !v1) {
      return { valid: false, reason: 'invalid_signature_format' };
    }

    // Construir el manifest para verificar
    // Formato: id:[data.id];request-id:[x-request-id];ts:[ts];
    const manifest = `id:${dataId || ''};request-id:${xRequestId || ''};ts:${ts};`;

    // Calcular HMAC-SHA256
    const hmac = crypto
      .createHmac('sha256', webhookSecret)
      .update(manifest)
      .digest('hex');

    if (hmac !== v1) {
      this.logger.warn(
        `Webhook signature mismatch: expected ${hmac.substring(0, 10)}..., got ${v1.substring(0, 10)}...`,
      );
      return { valid: false, reason: 'signature_mismatch' };
    }

    // Validar timestamp (rechazar webhooks muy viejos, > 5 minutos)
    const webhookTime = parseInt(ts, 10) * 1000; // ts está en segundos
    const now = Date.now();
    const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos

    if (isNaN(webhookTime) || now - webhookTime > MAX_AGE_MS) {
      this.logger.warn(
        `Webhook timestamp too old or invalid: ts=${ts}, age=${(now - webhookTime) / 1000}s`,
      );
      return { valid: false, reason: 'timestamp_expired' };
    }

    return { valid: true };
  }

  async handleWebhook(
    query: { type?: string; 'data.id'?: string },
    body: any,
  ): Promise<WebhookProcessResult> {
    const paymentId = query['data.id'] || body?.data?.id;
    const type = query.type || body?.type;

    this.logger.log(`Webhook received: type=${type}, paymentId=${paymentId}`);

    // Solo procesamos pagos
    if (type !== 'payment' || !paymentId) {
      this.logger.log('Ignoring non-payment webhook');
      return { received: true };
    }

    try {
      // Buscar el payment en MP y la checkout session correspondiente
      const result = await this.findPaymentAndCheckoutSession(
        String(paymentId),
      );

      if (!result) {
        this.logger.warn(`Could not find order for payment ${paymentId}`);
        return { received: true, processed: false, error: 'Order not found' };
      }

      const { payment, checkoutSession } = result;

      // Solo procesamos si el pago está aprobado
      if (payment.status !== 'approved') {
        this.logger.log(
          `Payment ${paymentId} status is ${payment.status}, not processing`,
        );
        return {
          received: true,
          processed: false,
          status: payment.status,
          checkoutSessionId: checkoutSession.id,
        };
      }

      // Ya está pagado?
      if (checkoutSession.paymentStatus === 'PAID' || checkoutSession.paidAt) {
        this.logger.log(
          `CheckoutSession ${checkoutSession.id} already paid, skipping`,
        );
        return {
          received: true,
          processed: true,
          checkoutSessionId: checkoutSession.id,
          status: 'already_paid',
        };
      }

      // Retornar info para que el caller (OrdersService) procese
      return {
        received: true,
        processed: true,
        checkoutSessionId: checkoutSession.id,
        status: payment.status,
      };
    } catch (error: any) {
      this.logger.error(`Error processing webhook: ${error.message}`);
      return { received: true, processed: false, error: error.message };
    }
  }

  async getPaymentDetails(
    paymentId: string,
    accessToken: string,
  ): Promise<any> {
    const response = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!response.ok) {
      return null;
    }

    return response.json();
  }

  private async findPaymentAndCheckoutSession(paymentId: string): Promise<{
    payment: any;
    checkoutSession: any;
    accessToken: string;
  } | null> {
    // Buscar checkout sessions pendientes recientes y probar con cada token
    const pendingSessions = await this.prisma.checkoutSession.findMany({
      where: {
        paymentStatus: 'PENDING',
        preferenceId: { not: null },
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Últimas 24h
        },
      },
      include: {
        restaurant: {
          include: {
            mercadoPagoCredential: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Agrupar por restaurante para no repetir llamadas con el mismo token
    const restaurantSessions = new Map<string, typeof pendingSessions>();

    for (const session of pendingSessions) {
      const restaurantId = session.restaurantId;
      if (!restaurantSessions.has(restaurantId)) {
        restaurantSessions.set(restaurantId, []);
      }
      restaurantSessions.get(restaurantId)!.push(session);
    }

    // Probar cada restaurante
    for (const [restaurantId, sessions] of restaurantSessions) {
      const accessToken =
        await this.credentialsService.getDecryptedToken(restaurantId);

      if (!accessToken) {
        // Intentar con token global
        const globalToken = this.configService.get<string>(
          'MERCADOPAGO_ACCESS_TOKEN',
        );
        if (!globalToken) continue;

        const payment = await this.getPaymentDetails(paymentId, globalToken);
        if (payment) {
          // Buscar checkout session que coincida
          for (const session of sessions) {
            if (payment.external_reference === session.id) {
              return {
                payment,
                checkoutSession: session,
                accessToken: globalToken,
              };
            }
          }
        }
        continue;
      }

      try {
        const payment = await this.getPaymentDetails(paymentId, accessToken);

        if (payment) {
          // Buscar checkout session que coincida con external_reference
          for (const session of sessions) {
            if (payment.external_reference === session.id) {
              return { payment, checkoutSession: session, accessToken };
            }
          }

          // Si no encontramos por external_reference, buscar por metadata.orderId (compat)
          if (payment.metadata?.orderId) {
            const session = sessions.find(
              (s) => s.id === payment.metadata.orderId,
            );
            if (session) {
              return { payment, checkoutSession: session, accessToken };
            }
          }
        }
      } catch (e) {
        this.logger.warn(
          `Failed to get payment details for restaurant ${restaurantId}: ${e}`,
        );
        continue;
      }
    }

    // Último intento: token global sin filtro de restaurante
    const globalToken = this.configService.get<string>(
      'MERCADOPAGO_ACCESS_TOKEN',
    );
    if (globalToken) {
      const payment = await this.getPaymentDetails(paymentId, globalToken);
      if (payment?.external_reference) {
        const checkoutSession = await this.prisma.checkoutSession.findUnique({
          where: { id: payment.external_reference },
          include: {
            restaurant: {
              include: {
                mercadoPagoCredential: true,
              },
            },
          },
        });

        if (checkoutSession) {
          return { payment, checkoutSession, accessToken: globalToken };
        }
      }
    }

    return null;
  }

  /**
   * Genera el event key para idempotencia
   */
  computeEventKey(rawBody: Buffer | undefined, payload: any): string {
    const type = typeof payload?.type === 'string' ? payload.type : '';
    const id = payload?.data?.id;

    if (type && (typeof id === 'string' || typeof id === 'number')) {
      return `mercadopago:${type}:${String(id)}`;
    }

    const raw = rawBody
      ? rawBody
      : Buffer.from(JSON.stringify(payload ?? {}), 'utf8');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    return `mercadopago:sha256:${hash}`;
  }

  /**
   * Registra el evento de webhook para idempotencia
   */
  async recordWebhookEvent(
    rawBody: Buffer | undefined,
    payload: any,
  ): Promise<{ isNew: boolean; eventKey: string }> {
    const eventKey = this.computeEventKey(rawBody, payload);

    const existing = await this.prisma.webhookEvent.findUnique({
      where: { eventKey },
      select: { id: true },
    });

    await this.prisma.webhookEvent.upsert({
      where: { eventKey },
      create: {
        provider: 'mercadopago',
        eventKey,
        payload,
      },
      update: {
        // Mantener el último payload recibido (útil para debug)
        payload,
      },
    });

    return { isNew: !existing, eventKey };
  }
}
