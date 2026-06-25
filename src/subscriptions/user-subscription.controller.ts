import { Controller, Get } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { AuthService } from '../auth/auth.service';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('api/users/me')
export class UserSubscriptionController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly authService: AuthService,
  ) {}

  @Get('subscription')
  @ApiOperation({ summary: 'Obtener suscripción de la cuenta del usuario' })
  @ApiResponse({ status: 200, description: 'Suscripción de cuenta' })
  async getAccountSubscription(@CurrentUser() user: RequestUser) {
    await this.authService.validateUser(user.userId);
    return this.subscriptionsService.getAccountSubscription(user.userId);
  }

  @Get('subscription/invoices')
  @ApiOperation({ summary: 'Facturas de la suscripción de la cuenta' })
  async getAccountInvoices(@CurrentUser() user: RequestUser) {
    await this.authService.validateUser(user.userId);
    return this.subscriptionsService.getAccountInvoices(user.userId);
  }

  @Get('subscription/summary')
  @ApiOperation({ summary: 'Resumen de suscripción de la cuenta' })
  async getAccountSubscriptionSummary(@CurrentUser() user: RequestUser) {
    await this.authService.validateUser(user.userId);
    return this.subscriptionsService.getAccountSubscriptionSummary(user.userId);
  }
}
