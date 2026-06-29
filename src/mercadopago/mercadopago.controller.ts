import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  BadRequestException,
  ForbiddenException,
  GoneException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { assertRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoWebhookService } from './mercadopago-webhook.service';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';
import type { PreferenceRequestBody } from './mercadopago.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';
import type { Request } from 'express';

@ApiTags('mercadopago')
@Controller('api/mercadopago')
export class MercadoPagoController {
  constructor(
    private readonly credentialsService: MercadoPagoCredentialsService,
    private readonly mercadoPagoService: MercadoPagoService,
    private readonly webhookService: MercadoPagoWebhookService,
    private readonly oauthService: MercadoPagoOAuthService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
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

    if (!user) throw new ForbiddenException('Unauthorized');
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

    if (!user) throw new ForbiddenException('Unauthorized');
    assertRestaurantAccess(user, restaurantId);

    const accessToken = (body?.accessToken ?? '').trim();
    if (!accessToken) {
      throw new BadRequestException({ error: 'accessToken es requerido' });
    }

    const validation = await this.credentialsService.validateAccessToken(
      accessToken,
      !!body.isSandbox,
    );
    if (!validation.ok) {
      throw new BadRequestException({
        error: validation.message || 'Access token inválido',
        reason: validation.reason,
      });
    }

    await this.credentialsService.setToken(
      restaurantId,
      accessToken,
      !!body.isSandbox,
      (body?.publicKey ?? '').trim() || undefined,
    );
    return { success: true };
  }

  @Post('tenant-token/activate')
  @HttpCode(200)
  async activateTenantToken(
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

    if (!user) throw new ForbiddenException('Unauthorized');
    assertRestaurantAccess(user, restaurantId);

    const accessToken = (body?.accessToken ?? '').trim();
    if (!accessToken) {
      throw new BadRequestException({ error: 'accessToken es requerido' });
    }

    const validation = await this.credentialsService.validateAccessToken(
      accessToken,
      !!body.isSandbox,
    );
    if (!validation.ok) {
      throw new BadRequestException({
        error: validation.message || 'Access token inválido',
        reason: validation.reason,
      });
    }

    await this.credentialsService.setTokenAndEnableDigitalWallet(
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

    if (!user) throw new ForbiddenException('Unauthorized');
    assertRestaurantAccess(user, restaurantId);

    await this.credentialsService.clearToken(restaurantId);
    return { success: true };
  }

  @Delete('tenant-token/activate')
  async deactivateTenantToken(
    @Body() body: { restaurantId?: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = (body?.restaurantId ?? '').trim();
    if (!restaurantId) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }

    if (!user) throw new ForbiddenException('Unauthorized');
    assertRestaurantAccess(user, restaurantId);

    await this.credentialsService.clearTokenAndDisableDigitalWallet(
      restaurantId,
    );
    return { success: true };
  }

  @Get('public-key')
  async getPublicKey(
    @Query('restaurantId') restaurantId?: string,
    @CurrentUser() user?: RequestUser,
  ) {
    const id = (restaurantId ?? '').trim();

    if (id) {
      if (!user) throw new ForbiddenException('Unauthorized');
      assertRestaurantAccess(user, id);
    } else {
      // Require authentication even if no restaurantId provided
      if (!user) throw new BadRequestException('Unauthorized');
    }

    const key = await this.mercadoPagoService.getPublishableKey(
      id || undefined,
    );

    return { publicKey: key ?? null };
  }

  // ===== OAuth (Mercado Pago "Conectar cuenta") =====

  /**
   * Inicia el flujo OAuth.
   * El usuario debe estar autenticado y ser owner del restaurante.
   * Devuelve `{ url }` para que el frontend redirija, o redirige 302 si se pasa `?redirect=1`.
   */
  @Get('oauth/authorize')
  async oauthAuthorize(
    @Query('restaurantId') restaurantId: string | undefined,
    @Query('returnTo') returnTo: string | undefined,
    @Query('redirect') redirect: string | undefined,
    @CurrentUser() user: RequestUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ url: string } | void> {
    const id = (restaurantId ?? '').trim();
    if (!id) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }
    if (!user) throw new ForbiddenException('Unauthorized');

    assertRestaurantAccess(user, id);

    if (!this.oauthService.isConfigured()) {
      throw new BadRequestException({
        error: 'OAuth de Mercado Pago no está configurado en este entorno',
      });
    }

    const url = this.oauthService.buildAuthorizationUrl(id, returnTo);

    if (redirect === '1' || redirect === 'true') {
      res.redirect(302, url);
      return;
    }

    return { url };
  }

  /**
   * Callback público: Mercado Pago redirige aquí con `code` y `state`.
   * Intercambia el code, persiste tokens cifrados, activa digital-wallet
   * y redirige al frontend con `?mp=connected` o `?mp=error`.
   */
  @Get('oauth/callback')
  @Public()
  async oauthCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') errorParam: string | undefined,
    @Query('error_description') errorDescription: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (errorParam) {
      const target = this.oauthService.buildFrontendRedirect(
        undefined,
        'error',
        { reason: errorDescription || errorParam },
      );
      res.redirect(302, target);
      return;
    }

    if (!code || !state) {
      const target = this.oauthService.buildFrontendRedirect(
        undefined,
        'error',
        { reason: 'missing_code_or_state' },
      );
      res.redirect(302, target);
      return;
    }

    try {
      const { returnTo } = await this.oauthService.handleCallback({
        code,
        state,
      });
      const target = this.oauthService.buildFrontendRedirect(
        returnTo,
        'connected',
      );
      res.redirect(302, target);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'oauth_failed';
      const target = this.oauthService.buildFrontendRedirect(
        undefined,
        'error',
        { reason: message.slice(0, 120) },
      );
      res.redirect(302, target);
    }
  }

  @Post('oauth/disconnect')
  @HttpCode(200)
  async oauthDisconnect(
    @Body() body: { restaurantId?: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const id = (body?.restaurantId ?? '').trim();
    if (!id) {
      throw new BadRequestException({ error: 'restaurantId es requerido' });
    }
    if (!user) throw new ForbiddenException('Unauthorized');

    assertRestaurantAccess(user, id);

    await this.credentialsService.clearTokenAndDisableDigitalWallet(id);
    return { success: true };
  }

  // B) Preference
  @Post('preference')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async createPreference(
    @Req() req: Request,
    @Body() body: PreferenceRequestBody,
  ) {
    const restaurantId =
      typeof body.restaurantId === 'string' ? body.restaurantId.trim() : '';
    if (restaurantId) {
      await this.publicWriteAbuse.assertPublicWriteAllowed({
        ip: getClientIp(req),
        scope: 'order',
        restaurantId,
      });
    }

    const origin = this.getOrigin(req);
    return this.mercadoPagoService.createPreference(origin, body);
  }

  // C) Webhook — usar /api/webhooks/mercadopago en producción
  @Post('webhook')
  @Public()
  @HttpCode(410)
  async webhook() {
    throw new GoneException(
      'Deprecated webhook endpoint. Configure MercadoPago to use /api/webhooks/mercadopago',
    );
  }

  // D) Webhook handler alternativo — redirigir al endpoint canónico
  @Post('webhooks/mercadopago')
  @Public()
  @HttpCode(200)
  async webhookAlt(
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

    if (!isLegacyIpn && process.env.NODE_ENV === 'production') {
      const signatureValidation = this.webhookService.validateWebhookSignature(
        xSignature,
        xRequestId,
        paymentId,
        rawBody,
      );

      if (!signatureValidation.valid) {
        throw new ForbiddenException({
          message: 'Invalid MercadoPago webhook signature',
          reason: signatureValidation.reason,
        });
      }
    }

    const { isNew } = await this.webhookService.recordWebhookEvent(
      rawBody,
      body,
    );

    if (!isNew) {
      return { received: true, duplicate: true };
    }

    return this.webhookService.handleWebhook(query, body);
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
