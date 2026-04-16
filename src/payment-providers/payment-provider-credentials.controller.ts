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
