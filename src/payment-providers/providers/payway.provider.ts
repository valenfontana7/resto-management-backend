import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import {
  IPaymentProvider,
  PaymentProviderName,
  CreateCheckoutInput,
  CheckoutResult,
  ChargeInput,
  ChargeResult,
  CreateCustomerInput,
  CreateCustomerResult,
  SaveCardInput,
  SavedCard,
  WebhookValidationInput,
  WebhookPayload,
  RefundInput,
  RefundResult,
} from '../interfaces';

/**
 * Payway (ex Decidir / Prisma) adapter.
 *
 * Usa la API REST v2 directamente.
 * Sandbox: https://developers.decidir.com/api/v2
 * Producción: https://live.decidir.com/api/v2
 *
 * Autenticación: header `apikey` con la private key del comercio.
 * Montos en CENTAVOS (long).
 */
@Injectable()
export class PaywayProvider implements IPaymentProvider {
  readonly name: PaymentProviderName = 'payway';
  private readonly logger = new Logger(PaywayProvider.name);

  private readonly sandboxBase = 'https://developers.decidir.com/api/v2';
  private readonly productionBase = 'https://live.decidir.com/api/v2';

  // Checkout form URLs
  private readonly sandboxCheckoutBase =
    'https://developers.decidir.com/web/checkout';
  private readonly productionCheckoutBase =
    'https://live.decidir.com/web/checkout';

  constructor(private readonly configService: ConfigService) {}

  // ─── Checkout (link de pago) ─────────────────────────────────────

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const { apiKey, publicApiKey, isSandbox } = this.resolveCredentials(
      input.metadata,
    );
    const base = this.getApiBase(isSandbox);
    const checkoutBase = isSandbox
      ? this.sandboxCheckoutBase
      : this.productionCheckoutBase;

    // Payway checkout via checkoutHash → payments/link
    const products = input.items.map((item, idx) => ({
      id: idx + 1,
      value: item.unitPrice / 100, // centavos → pesos (checkout link usa pesos)
      description: item.title,
      quantity: item.quantity,
    }));

    const totalPrice = input.items.reduce(
      (sum, item) => sum + (item.unitPrice / 100) * item.quantity,
      0,
    );

    const hashPayload = {
      origin_platform: 'API',
      currency: input.currency,
      products,
      total_price: totalPrice,
      site:
        input.metadata?.siteId ||
        this.configService.get<string>('PAYWAY_SITE_ID') ||
        '',
      success_url: input.backUrls?.success || '',
      cancel_url: input.backUrls?.failure || '',
      notifications_url: input.notificationUrl || '',
      template_id: 1,
      installments: [1, 3, 6, 12],
      plan_gobierno: false,
      public_apikey:
        publicApiKey ||
        this.configService.get<string>('PAYWAY_PUBLIC_KEY') ||
        '',
    };

    const res = await fetch(`${base}/checkout`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(hashPayload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Payway createCheckout failed: ${JSON.stringify(json)}`);
    }

    const paymentId = json?.id || json?.payment_id;
    const checkoutUrl = paymentId ? `${checkoutBase}/${paymentId}` : undefined;

    return {
      providerSessionId: String(paymentId || ''),
      checkoutUrl: checkoutUrl || '',
      sandboxCheckoutUrl: paymentId
        ? `${this.sandboxCheckoutBase}/${paymentId}`
        : undefined,
      raw: json,
    };
  }

  // ─── Cobro con tarjeta (token) ──────────────────────────────────

  async chargeWithSavedCard(input: ChargeInput): Promise<ChargeResult> {
    const { apiKey, isSandbox } = this.resolveCredentials(input.metadata);
    const base = this.getApiBase(isSandbox);
    const siteId =
      (input.metadata?.siteId as string) ||
      this.configService.get<string>('PAYWAY_SITE_ID') ||
      '';

    const siteTransactionId =
      input.idempotencyKey ||
      `${siteId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    const payload: Record<string, unknown> = {
      site_transaction_id: siteTransactionId,
      token: input.paymentMethodToken,
      user_id: input.customerId || '',
      payment_method_id: Number(input.metadata?.paymentMethodId) || 1, // 1=Visa default
      bin: (input.metadata?.bin as string) || '',
      amount: input.amount, // ya en centavos
      currency: input.currency,
      installments: Number(input.metadata?.installments) || 1,
      description: input.description || '',
      payment_type: 'single',
      sub_payments: [],
    };

    const res = await fetch(`${base}/payments`, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Payway charge failed: ${JSON.stringify(json)}`);
    }

    return {
      providerPaymentId: String(json.id),
      status: this.mapStatus(json.status),
      statusDetail: json.status_details?.error || '',
      amount: json.amount || input.amount,
      raw: json,
    };
  }

  // ─── Customer ────────────────────────────────────────────────────

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<CreateCustomerResult> {
    // Payway no tiene un endpoint explícito de customers.
    // El user_id se define a nivel comercio y se envía en cada pago.
    // Generamos un ID determinístico basado en el email.
    const customerId = input.email
      ? crypto
          .createHash('sha256')
          .update(input.email)
          .digest('hex')
          .substring(0, 32)
      : crypto.randomUUID();

    return {
      customerId,
      raw: { note: 'Payway uses user_id at payment level, no customer API' },
    };
  }

  // ─── Cards ───────────────────────────────────────────────────────

  async saveCard(input: SaveCardInput): Promise<SavedCard> {
    // En Payway, las tarjetas se tokenizan automáticamente al primer pago.
    // El token de la tarjeta se recibe en la respuesta del pago (customer_token).
    // Este método existe para compatibilidad con la interfaz.
    return {
      cardId: input.token,
      brand: 'unknown',
      last4: '',
      expiryMonth: 0,
      expiryYear: 0,
      cardholderName: input.metadata?.cardholderName as string,
    };
  }

  async listCards(customerId: string): Promise<SavedCard[]> {
    const apiKey = this.configService.get<string>('PAYWAY_PRIVATE_KEY');
    if (!apiKey) return [];

    const isSandbox =
      this.configService.get<string>('PAYWAY_SANDBOX') === 'true';
    const base = this.getApiBase(isSandbox);

    const res = await fetch(`${base}/usersite/${customerId}/cardtokens`, {
      headers: this.headers(apiKey),
    });

    if (!res.ok) return [];
    const json = await res.json().catch(() => null);
    if (!json?.tokens || !Array.isArray(json.tokens)) return [];

    return json.tokens.map((t: Record<string, unknown>) => {
      const pm = t.payment_method_id;
      const lastFour = t.last_four_digits;

      const brand =
        typeof pm === 'string' || typeof pm === 'number'
          ? String(pm)
          : pm && typeof pm === 'object'
            ? (pm as any).name || String((pm as any).id || 'unknown')
            : 'unknown';

      const last4 =
        typeof lastFour === 'string' || typeof lastFour === 'number'
          ? String(lastFour)
          : lastFour && typeof lastFour === 'object'
            ? (lastFour as any).last4 || (lastFour as any).digits || ''
            : '';

      return {
        cardId: String(t.token),
        brand,
        last4,
        expiryMonth: Number(t.expiration_month) || 0,
        expiryYear: Number(t.expiration_year) || 0,
        cardholderName: (t.card_holder as Record<string, string>)?.name,
      };
    });
  }

  async deleteCard(_customerId: string, cardId: string): Promise<void> {
    const apiKey = this.configService.get<string>('PAYWAY_PRIVATE_KEY');
    if (!apiKey) return;

    const isSandbox =
      this.configService.get<string>('PAYWAY_SANDBOX') === 'true';
    const base = this.getApiBase(isSandbox);

    await fetch(`${base}/cardtokens/${cardId}`, {
      method: 'DELETE',
      headers: this.headers(apiKey),
    });
  }

  // ─── Webhook ─────────────────────────────────────────────────────

  async validateAndParseWebhook(
    input: WebhookValidationInput,
  ): Promise<WebhookPayload> {
    const webhookSecret = this.configService.get<string>(
      'PAYWAY_WEBHOOK_SECRET',
    );

    // Payway puede enviar notificaciones con HMAC
    if (webhookSecret && input.headers['x-signature']) {
      const signature = input.headers['x-signature'];
      const rawStr =
        typeof input.rawBody === 'string'
          ? input.rawBody
          : input.rawBody.toString('utf8');

      const computed = crypto
        .createHmac('sha256', webhookSecret)
        .update(rawStr)
        .digest('hex');

      if (computed !== signature) {
        throw new Error('Invalid Payway webhook signature');
      }
    }

    const body =
      typeof input.rawBody === 'string'
        ? JSON.parse(input.rawBody)
        : JSON.parse(input.rawBody.toString('utf8'));

    // Payway envía: { id, site_transaction_id, status, amount, ... }
    const paymentId = body?.id;
    const status = body?.status;
    const siteTransactionId = body?.site_transaction_id;

    if (paymentId) {
      return {
        eventType: 'payment',
        providerPaymentId: String(paymentId),
        externalReference: siteTransactionId,
        status: this.mapStatus(status),
        amount: body.amount ? Number(body.amount) : undefined,
        raw: body,
      };
    }

    return {
      eventType: 'other',
      providerPaymentId: '',
      status: 'pending',
      raw: body,
    };
  }

  // ─── Refund ──────────────────────────────────────────────────────

  async refund(input: RefundInput): Promise<RefundResult> {
    const apiKey =
      (input.metadata?.apiKey as string) ||
      this.configService.get<string>('PAYWAY_PRIVATE_KEY');
    if (!apiKey) throw new Error('PAYWAY_PRIVATE_KEY not configured');

    const isSandbox =
      this.configService.get<string>('PAYWAY_SANDBOX') === 'true';
    const base = this.getApiBase(isSandbox);

    const url = `${base}/payments/${input.providerPaymentId}/refunds`;
    const body: Record<string, unknown> = {};
    if (input.amount) {
      body.amount = input.amount; // ya en centavos
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(apiKey),
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Payway refund failed: ${JSON.stringify(json)}`);
    }

    return {
      refundId: String(json.id || ''),
      status: json.status === 'approved' ? 'approved' : 'pending',
      amount: json.amount || input.amount || 0,
      raw: json,
    };
  }

  // ─── Payment status ──────────────────────────────────────────────

  async getPaymentStatus(providerPaymentId: string) {
    const apiKey = this.configService.get<string>('PAYWAY_PRIVATE_KEY');
    if (!apiKey) throw new Error('PAYWAY_PRIVATE_KEY not configured');

    const isSandbox =
      this.configService.get<string>('PAYWAY_SANDBOX') === 'true';
    const base = this.getApiBase(isSandbox);

    const res = await fetch(`${base}/payments/${providerPaymentId}`, {
      headers: this.headers(apiKey),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        `Payway getPaymentStatus failed: ${JSON.stringify(json)}`,
      );
    }

    return {
      status: this.mapStatus(json.status),
      statusDetail: json.status_details?.error || '',
      amount: json.amount || 0,
      raw: json,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private resolveCredentials(metadata?: Record<string, unknown>): {
    apiKey: string;
    publicApiKey?: string;
    isSandbox: boolean;
  } {
    const apiKey =
      (metadata?.apiKey as string) ||
      this.configService.get<string>('PAYWAY_PRIVATE_KEY');
    const publicApiKey =
      (metadata?.publicApiKey as string) ||
      this.configService.get<string>('PAYWAY_PUBLIC_KEY');
    const isSandbox =
      metadata?.isSandbox !== undefined
        ? Boolean(metadata.isSandbox)
        : this.configService.get<string>('PAYWAY_SANDBOX') === 'true';

    if (!apiKey) throw new Error('PAYWAY_PRIVATE_KEY not configured');

    return { apiKey, publicApiKey, isSandbox };
  }

  private getApiBase(isSandbox: boolean): string {
    return isSandbox ? this.sandboxBase : this.productionBase;
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      apikey: apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    };
  }

  private mapStatus(
    paywayStatus: string,
  ): 'approved' | 'pending' | 'rejected' | 'refunded' | 'cancelled' {
    switch (paywayStatus) {
      case 'approved':
        return 'approved';
      case 'rejected':
      case 'declined':
        return 'rejected';
      case 'refunded':
        return 'refunded';
      case 'annulled':
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }
}
