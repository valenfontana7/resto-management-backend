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
