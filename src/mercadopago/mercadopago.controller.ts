import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { assertRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoWebhookService } from './mercadopago-webhook.service';
import type { PreferenceRequestBody } from './mercadopago.service';

@ApiTags('mercadopago')
@Controller('api/mercadopago')
export class MercadoPagoController {
  constructor(
    private readonly credentialsService: MercadoPagoCredentialsService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly webhookService: MercadoPagoWebhookService,
  ) {}

  // A) Tenant token
  @Get('tenant-token')
  async getTenantTokenStatus(
    @Query('restaurantId') restaurantId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const id = (restaurantId ?? '').trim();
    if (!id) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    assertRestaurantAccess(user, id);

    return this.credentialsService.getStatus(id);
  }

  @Post('tenant-token')
  @HttpCode(200)
  async setTenantToken(
    @Body()
    body: {
      restaurantId?: string;
      accessToken?: string;
      isSandbox?: boolean;
      publicKey?: string;
    },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = (body?.restaurantId ?? '').trim();
    if (!restaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    assertRestaurantAccess(user, restaurantId);

    const accessToken = (body?.accessToken ?? '').trim();
    if (!accessToken) {
      throw new BadRequestException({ error: 'accessToken es requerido' });
    }

    await this.credentialsService.setToken(
      restaurantId,
      accessToken,
      !!body.isSandbox,
      (body?.publicKey ?? '').trim() || undefined,
    );
    return { success: true };
  }

  @Delete('tenant-token')
  async clearTenantToken(
    @Body() body: { restaurantId?: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = (body?.restaurantId ?? '').trim();
    if (!restaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    assertRestaurantAccess(user, restaurantId);

    await this.credentialsService.clearToken(restaurantId);
    return { success: true };
  }

  @Get('public-key')
  async getPublicKey(
    @Query('restaurantId') restaurantId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const id = (restaurantId ?? '').trim();

    if (id) {
      assertRestaurantAccess(user, id);
    } else {
      // Require authentication even if no restaurantId provided
      if (!user) throw new BadRequestException('Unauthorized');
    }

    const key = (await this.credentialsService.getDecryptedToken)
      ? await this.mercadoPagoService.getPublishableKey(id || undefined)
      : await this.mercadoPagoService.getPublishableKey(id || undefined);

    return { publicKey: key ?? null };
  }

  // B) Preference
  @Post('preference')
  @Public()
  @HttpCode(200)
  async createPreference(@Req() req: any, @Body() body: PreferenceRequestBody) {
    const origin = this.getOrigin(req);
    return this.mercadoPagoService.createPreference(origin, body);
  }

  // C) Webhook
  @Post('webhook')
  @Public()
  @HttpCode(200)
  async webhook(
    @Req() req: any,
    @Body() body: any,
    @Query() query: { type?: string; 'data.id'?: string },
  ) {
    const rawBody: Buffer | undefined = req?.rawBody;

    // Registrar evento para idempotencia
    const { isNew } = await this.webhookService.recordWebhookEvent(
      rawBody,
      body,
    );

    if (!isNew) {
      // Ya procesamos este evento
      return { received: true, duplicate: true };
    }

    // Procesar el webhook
    const result = await this.webhookService.handleWebhook(query, body);

    return result;
  }

  // D) Webhook handler alternativo en ruta /webhooks/mercadopago
  @Post('webhooks/mercadopago')
  @Public()
  @HttpCode(200)
  async webhookAlt(
    @Req() req: any,
    @Body() body: any,
    @Query() query: { type?: string; 'data.id'?: string },
  ) {
    return this.webhook(req, body, query);
  }

  private getOrigin(req: any): string {
    const baseUrl = (process.env.BASE_URL ?? '').trim();
    if (baseUrl) {
      return baseUrl.replace(/\/$/, '');
    }

    const headers = req?.headers ?? {};
    const proto = (headers['x-forwarded-proto'] || req?.protocol || 'http')
      .toString()
      .split(',')[0]
      .trim();
    const host = (headers['x-forwarded-host'] || headers['host'] || '')
      .toString()
      .split(',')[0]
      .trim();

    if (!host) {
      return 'http://localhost:3000';
    }

    return `${proto}://${host}`;
  }
}
