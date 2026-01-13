import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import * as crypto from 'crypto';

export type PreferenceItem = {
  title: string;
  quantity: number;
  unit_price: number;
};

export type PreferenceRequestBody = {
  slug?: string;
  restaurantId?: string;
  orderId: string;
  items: PreferenceItem[];
  sandbox?: boolean;
};

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly credentialsService: MercadoPagoCredentialsService,
  ) {}

  /**
   * Crea un customer en MercadoPago para el restaurante indicado.
   * Persiste nada aquí; retorna el mpCustomerId.
   */
  async createCustomer(
    restaurantId: string,
    metadata?: { email?: string; description?: string },
    useGlobal = false,
  ): Promise<string> {
    const isSandbox = !!(
      await this.prisma.mercadoPagoCredential.findUnique({
        where: { restaurantId },
        select: { isSandbox: true },
      })
    )?.isSandbox;

    const accessToken = useGlobal
      ? await this.resolveAccessToken('', false)
      : await this.resolveAccessToken(restaurantId, isSandbox);

    const body: any = {};
    if (metadata?.email) body.email = metadata.email;
    if (metadata?.description) body.description = metadata.description;

    const res = await fetch('https://api.mercadopago.com/v1/customers', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      // Try to parse JSON error body to detect 'customer already exist'
      const detailsJson = await res.json().catch(() => null);
      const detailsText = detailsJson
        ? JSON.stringify(detailsJson)
        : await res.text().catch(() => '');

      // If the error indicates the customer already exists, attempt to find it by email
      const causes = detailsJson?.cause ?? null;
      const alreadyExists = Array.isArray(causes)
        ? causes.some(
            (c: any) =>
              String(c.code) === '101' ||
              (c.description || '').toLowerCase().includes('customer already'),
          )
        : false;

      if (alreadyExists && metadata?.email) {
        try {
          const searchUrl = `https://api.mercadopago.com/v1/customers/search?email=${encodeURIComponent(
            metadata.email,
          )}`;
          const searchRes = await fetch(searchUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (searchRes.ok) {
            const searchJson = await searchRes.json();
            // MercadoPago returns { results: [ { id, ... }, ... ] }
            const found =
              (searchJson?.results && searchJson.results[0]) || null;
            if (found?.id) return String(found.id);
          }
        } catch (e) {
          // ignore and fall through to throw original error
        }
      }

      throw new Error(`MercadoPago createCustomer failed: ${detailsText}`);
    }

    const json = await res.json();
    return String(json.id);
  }

  /**
   * Realiza un cargo usando una tarjeta previamente asociada al customer (card_id)
   * Devuelve la respuesta de MercadoPago en caso de éxito.
   */
  /**
   * Realiza un cargo usando una tarjeta previamente asociada al customer (card_id)
   * @param amount Monto en CENTAVOS (se convierte a pesos internamente)
   * @param idempotencyKey Clave única para evitar cargos duplicados (ej: subscriptionId_date)
   * @returns Respuesta de MercadoPago con status del pago
   * @throws Error si el pago falla o es rechazado
   */
  async chargeWithSavedCard(
    restaurantId: string,
    mpCustomerId: string,
    mpCardId: string,
    amount: number,
    currency = 'ARS',
    description = 'Subscription charge',
    useGlobal = true,
    idempotencyKey?: string,
  ): Promise<{
    id: string;
    status: string;
    status_detail: string;
    transaction_amount: number;
  }> {
    if (!mpCustomerId || !mpCardId)
      throw new Error('mpCustomerId and mpCardId are required');

    // Validar monto mínimo (MercadoPago rechaza montos muy bajos)
    const MIN_AMOUNT_CENTS = 100; // $1 ARS mínimo
    if (amount < MIN_AMOUNT_CENTS) {
      throw new Error(`Amount must be at least ${MIN_AMOUNT_CENTS} cents`);
    }

    // Convertir de centavos a pesos para MercadoPago
    const amountInPesos = amount / 100;

    const cred = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: { isSandbox: true },
    });
    const isSandbox = !!cred?.isSandbox;
    const accessToken = useGlobal
      ? await this.resolveAccessToken('', false)
      : await this.resolveAccessToken(restaurantId, isSandbox);

    const url = 'https://api.mercadopago.com/v1/payments';
    const payload: any = {
      transaction_amount: amountInPesos,
      currency_id: currency,
      description,
      payer: { id: mpCustomerId },
      card_id: mpCardId,
      // mark that this is a recurring/platform-initiated payment
      metadata: {
        reason: 'subscription_renewal',
        idempotency_key: idempotencyKey || null,
      },
    };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    // Agregar header de idempotencia si se proporciona
    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const details = json
        ? JSON.stringify(json)
        : await res.text().catch(() => '');
      throw new Error(`MercadoPago charge failed: ${details}`);
    }

    // Validar que el pago fue realmente aprobado
    const paymentStatus = json?.status;
    if (paymentStatus !== 'approved') {
      this.logger.warn(
        `Payment not approved: status=${paymentStatus}, detail=${json?.status_detail}`,
      );
      throw new Error(
        `Payment not approved: ${paymentStatus} - ${json?.status_detail || 'unknown'}`,
      );
    }

    return {
      id: String(json.id),
      status: json.status,
      status_detail: json.status_detail,
      transaction_amount: json.transaction_amount,
    };
  }

  /**
   * Asocia una tarjeta al customer usando card_token.
   */
  async createCardForCustomer(
    restaurantId: string,
    mpCustomerId: string,
    cardToken: string,
    useGlobal = false,
  ): Promise<any> {
    if (!cardToken) throw new Error('card token required');

    const cred = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: { isSandbox: true },
    });
    const isSandbox = !!cred?.isSandbox;
    const accessToken = useGlobal
      ? await this.resolveAccessToken('', false)
      : await this.resolveAccessToken(restaurantId, isSandbox);

    const url = `https://api.mercadopago.com/v1/customers/${mpCustomerId}/cards`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token: cardToken }),
    });

    if (!res.ok) {
      const details = await res.text().catch(() => '');
      throw new Error(`MercadoPago createCard failed: ${details}`);
    }

    const json = await res.json();
    // Try to fetch full card details (some MercadoPago responses may omit PAN digits
    // in the creation response). If available, prefer the GET response which often
    // includes nested `card` object with last_four / last_four_digits.
    try {
      const cardId = String(json.id ?? json.card?.id ?? '');
      if (cardId) {
        const getUrl = `https://api.mercadopago.com/v1/customers/${mpCustomerId}/cards/${cardId}`;
        const getRes = await fetch(getUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (getRes.ok) {
          const full = await getRes.json();
          return full;
        }
      }
    } catch (e) {
      // ignore and fall back to original create response
    }

    return json;
  }

  /**
   * Obtiene los detalles completos de una tarjeta asociada a un customer.
   */
  async getCardForCustomer(
    restaurantId: string,
    mpCustomerId: string,
    mpCardId: string,
    useGlobal = false,
  ): Promise<any> {
    if (!mpCustomerId || !mpCardId)
      throw new Error('mpCustomerId and mpCardId are required');

    const cred = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: { isSandbox: true },
    });
    const isSandbox = !!cred?.isSandbox;
    const accessToken = useGlobal
      ? await this.resolveAccessToken('', false)
      : await this.resolveAccessToken(restaurantId, isSandbox);

    const getUrl = `https://api.mercadopago.com/v1/customers/${mpCustomerId}/cards/${mpCardId}`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!getRes.ok) {
      const details = await getRes.text().catch(() => '');
      throw new Error(`MercadoPago getCard failed: ${details}`);
    }

    const full = await getRes.json();
    return full;
  }

  /**
   * Elimina una tarjeta del customer en MP (si la API lo permite).
   */
  async deleteCardForCustomer(
    restaurantId: string,
    mpCustomerId: string,
    mpCardId: string,
  ): Promise<void> {
    const cred = await this.prisma.mercadoPagoCredential.findUnique({
      where: { restaurantId },
      select: { isSandbox: true },
    });
    const isSandbox = !!cred?.isSandbox;
    const accessToken = await this.resolveAccessToken(restaurantId, isSandbox);

    const url = `https://api.mercadopago.com/v1/customers/${mpCustomerId}/cards/${mpCardId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const details = await res.text().catch(() => '');
      throw new Error(`MercadoPago deleteCard failed: ${details}`);
    }
  }

  /**
   * Devuelve la publishable/public key (publishable) para el restaurante o fallback global.
   */
  async getPublishableKey(restaurantId?: string): Promise<string | null> {
    // Prefer tenant publishableKey if present, then sandbox/global env vars.
    try {
      if (restaurantId) {
        const cred = await this.prisma.mercadoPagoCredential.findUnique({
          where: { restaurantId },
          select: { isSandbox: true, publishableKey: true },
        });

        if (cred?.publishableKey) {
          return cred.publishableKey;
        }

        const isSandbox = !!cred?.isSandbox;
        if (isSandbox) {
          const sandboxKey = (
            this.configService.get<string>('MERCADOPAGO_SANDBOX_PUBLIC_KEY') ??
            ''
          ).trim();
          if (sandboxKey) return sandboxKey;
        }
      }

      const globalKey = (
        this.configService.get<string>('MERCADOPAGO_PUBLIC_KEY') ?? ''
      ).trim();
      return globalKey || null;
    } catch (e) {
      return null;
    }
  }

  async createPreference(
    origin: string,
    body: PreferenceRequestBody,
  ): Promise<{
    preference: { id: string; init_point: string; sandbox_init_point?: string };
    isSandbox: boolean;
  }> {
    const orderId = (body?.orderId ?? '').trim();
    if (!orderId) {
      throw new BadRequestException({ error: 'orderId es requerido' });
    }

    if (!Array.isArray(body?.items) || body.items.length === 0) {
      throw new BadRequestException({ error: 'items inválidos' });
    }

    const mappedItems = body.items.map((item) => {
      const title = (item?.title ?? '').trim();
      const quantity = Number(item?.quantity);
      const unit_price = Number(item?.unit_price);

      const isValid =
        !!title &&
        Number.isFinite(quantity) &&
        quantity > 0 &&
        Number.isFinite(unit_price);

      return {
        isValid,
        item: {
          title,
          quantity,
          unit_price,
          currency_id: 'ARS',
        },
      };
    });

    if (mappedItems.some((x) => !x.isValid)) {
      throw new BadRequestException({ error: 'items inválidos' });
    }

    const slug = typeof body.slug === 'string' ? body.slug.trim() : '';
    const providedRestaurantId =
      typeof body.restaurantId === 'string' ? body.restaurantId.trim() : '';

    let effectiveRestaurantId = providedRestaurantId;
    if (!effectiveRestaurantId && slug) {
      const restaurant = await this.prisma.restaurant.findUnique({
        where: { slug },
        select: { id: true },
      });
      effectiveRestaurantId = restaurant?.id ?? '';
    }

    // Determinar si está en modo sandbox basándose en las credenciales del restaurante
    let isSandbox = !!body.sandbox;
    if (effectiveRestaurantId) {
      const credential = await this.prisma.mercadoPagoCredential.findUnique({
        where: { restaurantId: effectiveRestaurantId },
        select: { isSandbox: true },
      });
      if (credential) {
        isSandbox = !!credential.isSandbox;
      }
    }

    const accessToken = await this.resolveAccessToken(
      effectiveRestaurantId,
      isSandbox,
    );

    const orderPath = slug ? `/${slug}/order/${orderId}` : `/order/${orderId}`;

    // Prefer FRONTEND_URL for back_urls (user-facing), fallback to BASE_URL or request origin
    const frontendRaw = (
      this.configService.get<string>('FRONTEND_URL') ?? ''
    ).trim();
    const baseUrlRaw = (
      this.configService.get<string>('BASE_URL') ?? ''
    ).trim();
    const frontendBase = frontendRaw || baseUrlRaw || origin;

    // Basic validation: must be an absolute URL (start with http:// or https://)
    if (!/^https?:\/\//i.test(frontendBase)) {
      throw new BadRequestException({
        error:
          'Invalid FRONTEND_URL/BASE_URL configuration for building back_urls',
      });
    }

    const notificationUrl =
      this.configService.get<string>('MERCADOPAGO_NOTIFICATION_URL') ||
      `${origin}/api/webhooks/mercadopago`;

    // If frontendBase is not HTTPS (e.g., http://localhost), MercadoPago may reject
    // auto_return='approved' because back_urls must be publicly reachable via HTTPS.
    // In that case, omit auto_return to allow testing in local env.
    const autoReturn = /^https:\/\//i.test(frontendBase)
      ? 'approved'
      : undefined;

    const payload: any = {
      items: mappedItems.map((x) => x.item),
      back_urls: {
        success: `${frontendBase.replace(/\/$/, '')}${orderPath}`,
        pending: `${frontendBase.replace(/\/$/, '')}${orderPath}`,
        failure: `${frontendBase.replace(/\/$/, '')}${orderPath}`,
      },
      ...(autoReturn ? { auto_return: autoReturn } : {}),
      notification_url: notificationUrl,
      external_reference: orderId,
      metadata: {
        slug: slug || null,
        restaurantId: effectiveRestaurantId || null,
        orderId,
      },
    };

    const response = await fetch(
      'https://api.mercadopago.com/checkout/preferences',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      },
    );

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      const sentBackUrls = payload?.back_urls
        ? JSON.stringify(payload.back_urls)
        : '';
      throw new HttpException(
        {
          error: 'Error creando preferencia en MercadoPago',
          details: `${(details || '').slice(0, 4000)}${sentBackUrls ? ' | sent_back_urls: ' + sentBackUrls : ''}`,
        },
        502,
      );
    }

    const json: any = await response.json();

    return {
      preference: {
        id: json.id,
        init_point: json.init_point,
        sandbox_init_point: json.sandbox_init_point,
      },
      isSandbox,
    };
  }

  async recordWebhookEvent(
    rawBody: Buffer | undefined,
    payload: any,
  ): Promise<void> {
    const eventKey = this.computeEventKey(rawBody, payload);

    try {
      await this.prisma.webhookEvent.create({
        data: {
          id: crypto.randomUUID(),
          provider: 'mercadopago',
          eventKey,
          payload,
        },
      });
    } catch (err: any) {
      // idempotencia: si existe eventKey, no reprocesar
      const code = err?.code;
      if (code === 'P2002') {
        return;
      }

      this.logger.error('Error storing MercadoPago webhook event', {
        eventKey,
        error: err?.message ?? String(err),
      });
    }
  }

  private computeEventKey(rawBody: Buffer | undefined, payload: any): string {
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

  private async resolveAccessToken(
    restaurantId: string,
    sandbox = false,
  ): Promise<string> {
    // If a restaurantId is provided, try to resolve its credential first
    if (restaurantId) {
      const credentialRow = await this.prisma.mercadoPagoCredential.findUnique({
        where: { restaurantId },
        select: { isSandbox: true },
      });

      if (credentialRow) {
        const credentialIsSandbox = !!credentialRow.isSandbox;
        if (
          (sandbox && credentialIsSandbox) ||
          (!sandbox && !credentialIsSandbox)
        ) {
          const token =
            await this.credentialsService.getDecryptedToken(restaurantId);
          if (token) return token;
        }
      }
    }

    // Fallbacks
    if (sandbox) {
      const globalSandbox = (
        this.configService.get<string>('MERCADOPAGO_SANDBOX_ACCESS_TOKEN') ?? ''
      ).trim();
      if (globalSandbox) return globalSandbox;
      throw new BadRequestException({
        error:
          'MercadoPago sandbox no conectado para este restaurante y no hay MERCADOPAGO_SANDBOX_ACCESS_TOKEN global',
      });
    }

    const globalToken = (
      this.configService.get<string>('MERCADOPAGO_ACCESS_TOKEN') ?? ''
    ).trim();
    if (globalToken) {
      return globalToken;
    }

    throw new BadRequestException({
      error:
        'MercadoPago no conectado para este restaurante (falta token) y no hay MERCADOPAGO_ACCESS_TOKEN global',
    });
  }
}
