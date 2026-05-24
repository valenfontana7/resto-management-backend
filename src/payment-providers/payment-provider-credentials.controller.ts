import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { assertRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { AuthService } from '../auth/auth.service';
import {
  PaymentProviderCredentialsService,
  UpsertCredentialDto,
} from './payment-provider-credentials.service';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentProviderName } from './interfaces';

@ApiTags('payment-providers')
@Controller('api/payment-providers')
export class PaymentProviderCredentialsController {
  constructor(
    private readonly credentialsService: PaymentProviderCredentialsService,
    private readonly factory: PaymentProviderFactory,
    private readonly authService: AuthService,
  ) {}

  // ─── CRUD credenciales ───────────────────────────────────────────

  @Get('credentials')
  async listCredentials(
    @Query('restaurantId') restaurantId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);
    return this.credentialsService.listCredentials(restaurantId);
  }

  @Post('credentials')
  @HttpCode(200)
  async upsertCredential(
    @Body() body: UpsertCredentialDto & { restaurantId: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = body?.restaurantId?.trim();
    if (!restaurantId)
      throw new BadRequestException('restaurantId es requerido');
    if (!body.provider) throw new BadRequestException('provider es requerido');
    if (!body.secretKey)
      throw new BadRequestException('secretKey es requerida');

    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    return this.credentialsService.upsertCredential(restaurantId, {
      provider: body.provider,
      publicKey: body.publicKey,
      secretKey: body.secretKey,
      merchantId: body.merchantId,
      siteId: body.siteId,
      isSandbox: body.isSandbox,
      isActive: body.isActive,
      metadata: body.metadata,
    });
  }

  @Patch('credentials/:provider/toggle')
  async toggleActive(
    @Param('provider') provider: PaymentProviderName,
    @Body() body: { restaurantId: string; isActive: boolean },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = body?.restaurantId?.trim();
    if (!restaurantId)
      throw new BadRequestException('restaurantId es requerido');

    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    return this.credentialsService.toggleActive(
      restaurantId,
      provider,
      body.isActive,
    );
  }

  @Delete('credentials/:provider')
  async deleteCredential(
    @Param('provider') provider: PaymentProviderName,
    @Query('restaurantId') restaurantId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    if (!restaurantId?.trim())
      throw new BadRequestException('restaurantId es requerido');

    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    return this.credentialsService.deleteCredential(restaurantId, provider);
  }

  // ─── Proveedores activos ─────────────────────────────────────────

  @Get('active')
  async listActiveProviders(
    @Query('restaurantId') restaurantId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    return this.factory.listActiveProviders(restaurantId);
  }

  // ─── Validación de credenciales ──────────────────────────────────

  /**
   * Valida credenciales sin guardarlas. Útil para el wizard de onboarding.
   * Devuelve { valid, message, details }.
   */
  @Post('credentials/test')
  @HttpCode(200)
  async testCredentialsRaw(
    @Body()
    body: {
      restaurantId: string;
      provider: PaymentProviderName;
      secretKey: string;
      publicKey?: string;
      siteId?: string;
      merchantId?: string;
      isSandbox?: boolean;
    },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = body?.restaurantId?.trim();
    if (!restaurantId)
      throw new BadRequestException('restaurantId es requerido');
    if (!body.provider) throw new BadRequestException('provider es requerido');
    if (!body.secretKey)
      throw new BadRequestException('secretKey es requerida');

    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    const provider = this.factory.getProvider(body.provider);
    if (!provider.validateCredentials) {
      return {
        valid: true,
        message: `El provider ${body.provider} no soporta validación previa`,
      };
    }

    return provider.validateCredentials({
      apiKey: body.secretKey,
      publicApiKey: body.publicKey,
      siteId: body.siteId,
      merchantId: body.merchantId,
      isSandbox: Boolean(body.isSandbox),
    });
  }

  /**
   * Valida credenciales ya persistidas para el tenant.
   */
  @Post('credentials/:provider/test')
  @HttpCode(200)
  async testStoredCredentials(
    @Param('provider') providerName: PaymentProviderName,
    @Body() body: { restaurantId: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = body?.restaurantId?.trim();
    if (!restaurantId)
      throw new BadRequestException('restaurantId es requerido');

    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    const stored = await this.credentialsService.getDecryptedCredential(
      restaurantId,
      providerName,
    );
    if (!stored) {
      return {
        valid: false,
        message: `No hay credenciales guardadas de ${providerName}`,
      };
    }

    const provider = this.factory.getProvider(providerName);
    if (!provider.validateCredentials) {
      return {
        valid: true,
        message: `El provider ${providerName} no soporta validación`,
      };
    }

    const result = await provider.validateCredentials({
      apiKey: stored.secretKey,
      publicApiKey: stored.publicKey,
      siteId: stored.siteId,
      merchantId: stored.merchantId,
      isSandbox: stored.isSandbox,
      metadata: stored.metadata,
    });

    await this.credentialsService.recordTestResult(restaurantId, providerName, {
      ok: result.valid,
      error: result.valid ? undefined : result.message,
    });

    return result;
  }

  /**
   * Rota el webhookSecret del provider y devuelve el plaintext nuevo
   * (única vez que es visible).
   */
  @Post('credentials/:provider/rotate-webhook-secret')
  @HttpCode(200)
  async rotateWebhookSecret(
    @Param('provider') providerName: PaymentProviderName,
    @Body() body: { restaurantId: string },
    @CurrentUser() user?: RequestUser,
  ) {
    const restaurantId = body?.restaurantId?.trim();
    if (!restaurantId)
      throw new BadRequestException('restaurantId es requerido');

    this.assertAccess(user, restaurantId);
    await this.verifyAccess(user!, restaurantId);

    return this.credentialsService.rotateWebhookSecret(
      restaurantId,
      providerName,
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────

  private assertAccess(user: RequestUser | undefined, restaurantId: string) {
    if (!user) throw new ForbiddenException('Unauthorized');
    if (!restaurantId?.trim())
      throw new BadRequestException('restaurantId es requerido');
  }

  private async verifyAccess(user: RequestUser, restaurantId: string) {
    const freshUser = await this.authService.validateUser(user.userId);
    assertRestaurantAccess(freshUser, restaurantId);
  }
}
