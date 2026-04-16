import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import * as crypto from 'crypto';

/**
 * MercadoPago adapter que implementa IPaymentProvider.
 *
 * Usa la API REST directamente (sin SDK) para tener control total
 * sobre los requests y poder usar credentials per-tenant.
 */
@Injectable()
export class MercadoPagoProvider implements IPaymentProvider {
  readonly name: PaymentProviderName = 'mercadopago';
  private readonly logger = new Logger(MercadoPagoProvider.name);
  private readonly apiBase = 'https://api.mercadopago.com';

  constructor(private readonly configService: ConfigService) {}

  // ─── Checkout ────────────────────────────────────────────────────

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const accessToken = this.resolveAccessToken(
      input.metadata?.accessToken as string,
    );

    const items = input.items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description || '',
      quantity: item.quantity,
      unit_price: item.unitPrice / 100, // centavos → pesos
      currency_id: input.currency,
    }));

    const body = {
      items,
      back_urls: input.backUrls,
      auto_return: 'approved' as const,
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      payer: {
        name: input.customer.name,
        email: input.customer.email || '',
        phone: input.customer.phone
          ? { number: input.customer.phone }
          : undefined,
      },
      metadata: {
        order_id: input.orderId,
        restaurant_id: input.restaurantId,
        ...input.metadata,
      },
    };

    const res = await fetch(`${this.apiBase}/checkout/preferences`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        `MercadoPago createCheckout failed: ${JSON.stringify(json)}`,
      );
    }

    return {
      providerSessionId: json.id,
      checkoutUrl: json.init_point,
      sandboxCheckoutUrl: json.sandbox_init_point,
      raw: json,
    };
  }

  // ─── Cobro con tarjeta guardada ──────────────────────────────────

  async chargeWithSavedCard(input: ChargeInput): Promise<ChargeResult> {
    const accessToken = this.resolveAccessToken(
      input.metadata?.accessToken as string,
    );
    const amountInPesos = input.amount / 100;

    const payload: Record<string, unknown> = {
      transaction_amount: amountInPesos,
      currency_id: input.currency,
      description: input.description,
      payer: { id: input.customerId },
      card_id: input.paymentMethodToken,
      metadata: input.metadata || {},
    };

    const headers = this.headers(accessToken);
    if (input.idempotencyKey) {
      headers['X-Idempotency-Key'] = input.idempotencyKey;
    }

    const res = await fetch(`${this.apiBase}/v1/payments`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`MercadoPago charge failed: ${JSON.stringify(json)}`);
    }

    return {
      providerPaymentId: String(json.id),
      status: this.mapStatus(json.status),
      statusDetail: json.status_detail || '',
      amount: Math.round(json.transaction_amount * 100),
      raw: json,
    };
  }

  // ─── Customer ────────────────────────────────────────────────────

  async createCustomer(
    input: CreateCustomerInput,
  ): Promise<CreateCustomerResult> {
    const accessToken = this.resolveAccessToken(
      input.metadata?.accessToken as string,
    );

    const body: Record<string, unknown> = {};
    if (input.email) body.email = input.email;
    if (input.name) body.description = input.name;

    const res = await fetch(`${this.apiBase}/v1/customers`, {
      method: 'POST',
      headers: this.headers(accessToken),
      body: JSON.stringify(body),
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      // Si ya existe, buscar por email
      const causes = json?.cause ?? [];
      const alreadyExists =
        Array.isArray(causes) &&
        causes.some(
          (c: { code?: string; description?: string }) =>
            String(c.code) === '101' ||
            (c.description || '').toLowerCase().includes('customer already'),
        );

      if (alreadyExists && input.email) {
        const searchRes = await fetch(
          `${this.apiBase}/v1/customers/search?email=${encodeURIComponent(input.email)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const found = searchJson?.results?.[0];
          if (found?.id) return { customerId: String(found.id), raw: found };
        }
      }
      throw new Error(
        `MercadoPago createCustomer failed: ${JSON.stringify(json)}`,
      );
    }

    return { customerId: String(json.id), raw: json };
  }

  // ─── Cards ───────────────────────────────────────────────────────

  async saveCard(input: SaveCardInput): Promise<SavedCard> {
    const accessToken = this.resolveAccessToken(
      input.metadata?.accessToken as string,
    );

    const res = await fetch(
      `${this.apiBase}/v1/customers/${input.customerId}/cards`,
      {
        method: 'POST',
        headers: this.headers(accessToken),
        body: JSON.stringify({ token: input.token }),
      },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`MercadoPago saveCard failed: ${JSON.stringify(json)}`);
    }

    return {
      cardId: String(json.id),
      brand: json.payment_method?.id || json.payment_method?.name || 'unknown',
      last4: json.last_four_digits || '',
      expiryMonth: json.expiration_month || 0,
      expiryYear: json.expiration_year || 0,
      cardholderName: json.cardholder?.name,
      issuerId: json.issuer?.id ? String(json.issuer.id) : undefined,
      issuerName: json.issuer?.name,
    };
  }

  async listCards(customerId: string): Promise<SavedCard[]> {
    const accessToken = this.resolveGlobalAccessToken();

    const res = await fetch(
      `${this.apiBase}/v1/customers/${customerId}/cards`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    if (!res.ok) return [];
    const json = await res.json().catch(() => []);
    if (!Array.isArray(json)) return [];

    return json.map((card: Record<string, unknown>) => ({
      cardId: String(card.id),
      brand: (card.payment_method as Record<string, string>)?.id || 'unknown',
      last4: (card.last_four_digits as string) || '',
      expiryMonth: (card.expiration_month as number) || 0,
      expiryYear: (card.expiration_year as number) || 0,
      cardholderName: (card.cardholder as Record<string, string>)?.name,
      issuerId: (card.issuer as Record<string, unknown>)?.id
        ? String((card.issuer as Record<string, unknown>).id)
        : undefined,
      issuerName: (card.issuer as Record<string, string>)?.name,
    }));
  }

  async deleteCard(customerId: string, cardId: string): Promise<void> {
    const accessToken = this.resolveGlobalAccessToken();
    await fetch(`${this.apiBase}/v1/customers/${customerId}/cards/${cardId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  // ─── Webhook ─────────────────────────────────────────────────────

  async validateAndParseWebhook(
    input: WebhookValidationInput,
  ): Promise<WebhookPayload> {
    const webhookSecret = this.configService.get<string>(
      'MERCADOPAGO_WEBHOOK_SECRET',
    );

    if (webhookSecret) {
      const xSignature = input.headers['x-signature'];
      const xRequestId = input.headers['x-request-id'];
      const dataId = input.query?.['data.id'];

      if (xSignature && xRequestId) {
        const parts = xSignature.split(',').reduce(
          (acc, part) => {
            const [k, v] = part.split('=');
            acc[k?.trim()] = v?.trim();
            return acc;
          },
          {} as Record<string, string>,
        );

        const manifest = `id:${dataId || ''};request-id:${xRequestId};ts:${parts['ts'] || ''};`;
        const hmac = crypto
          .createHmac('sha256', webhookSecret)
          .update(manifest)
          .digest('hex');

        if (hmac !== parts['v1']) {
          throw new Error('Invalid MercadoPago webhook signature');
        }
      }
    }

    const body =
      typeof input.rawBody === 'string'
        ? JSON.parse(input.rawBody)
        : JSON.parse(input.rawBody.toString('utf8'));

    // MercadoPago envía `type: "payment"` y `data.id` como paymentId
    const dataId = body?.data?.id || input.query?.['data.id'];

    if (body?.type === 'payment' && dataId) {
      // Fetch detalles del pago
      const accessToken = this.resolveGlobalAccessToken();
      const paymentRes = await fetch(`${this.apiBase}/v1/payments/${dataId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const payment = await paymentRes.json().catch(() => null);

      if (payment) {
        return {
          eventType: 'payment',
          providerPaymentId: String(payment.id),
          externalReference: payment.external_reference,
          status: this.mapStatus(payment.status),
          amount: payment.transaction_amount
            ? Math.round(payment.transaction_amount * 100)
            : undefined,
          raw: payment,
        };
      }
    }

    return {
      eventType: 'other',
      providerPaymentId: String(dataId || ''),
      status: 'pending',
      raw: body,
    };
  }

  // ─── Refund ──────────────────────────────────────────────────────

  async refund(input: RefundInput): Promise<RefundResult> {
    const accessToken = this.resolveGlobalAccessToken();

    const body: Record<string, unknown> = {};
    if (input.amount) body.amount = input.amount / 100;

    const res = await fetch(
      `${this.apiBase}/v1/payments/${input.providerPaymentId}/refunds`,
      {
        method: 'POST',
        headers: this.headers(accessToken),
        body: JSON.stringify(body),
      },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`MercadoPago refund failed: ${JSON.stringify(json)}`);
    }

    return {
      refundId: String(json.id),
      status: json.status === 'approved' ? 'approved' : 'pending',
      amount: Math.round((json.amount || 0) * 100),
      raw: json,
    };
  }

  // ─── Payment status ──────────────────────────────────────────────

  async getPaymentStatus(providerPaymentId: string) {
    const accessToken = this.resolveGlobalAccessToken();

    const res = await fetch(
      `${this.apiBase}/v1/payments/${providerPaymentId}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(
        `MercadoPago getPaymentStatus failed: ${JSON.stringify(json)}`,
      );
    }

    return {
      status: this.mapStatus(json.status),
      statusDetail: json.status_detail || '',
      amount: Math.round((json.transaction_amount || 0) * 100),
      raw: json,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private resolveAccessToken(override?: string): string {
    if (override) return override;
    return this.resolveGlobalAccessToken();
  }

  private resolveGlobalAccessToken(): string {
    const token = this.configService.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    if (!token) throw new Error('MERCADOPAGO_ACCESS_TOKEN not configured');
    return token;
  }

  private headers(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  private mapStatus(
    mpStatus: string,
  ): 'approved' | 'pending' | 'rejected' | 'refunded' | 'cancelled' {
    switch (mpStatus) {
      case 'approved':
        return 'approved';
      case 'rejected':
      case 'cc_rejected_other_reason':
        return 'rejected';
      case 'refunded':
        return 'refunded';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'pending';
    }
  }
}
