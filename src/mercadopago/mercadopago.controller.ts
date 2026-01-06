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
import type { PreferenceRequestBody } from './mercadopago.service';

@ApiTags('mercadopago')
@Controller('api/mercadopago')
export class MercadoPagoController {
  constructor(
    private readonly credentialsService: MercadoPagoCredentialsService,
    private readonly mercadoPagoService: MercadoPagoService,
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
    body: { restaurantId?: string; accessToken?: string; isSandbox?: boolean },
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
  async webhook(@Req() req: any, @Body() body: any) {
    const rawBody: Buffer | undefined = req?.rawBody;
    await this.mercadoPagoService.recordWebhookEvent(rawBody, body);
    return { received: true };
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
