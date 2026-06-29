import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('api/users/me')
export class UserSubscriptionController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('subscription')
  @ApiOperation({ summary: 'Obtener suscripción de la cuenta del usuario' })
  @ApiQuery({
    name: 'fields',
    required: false,
    description: 'Use "minimal" para payload reducido en layout del admin',
  })
  @ApiResponse({ status: 200, description: 'Suscripción de cuenta' })
  async getAccountSubscription(
    @CurrentUser() user: RequestUser,
    @Query('fields') fields?: string,
  ) {
    return this.subscriptionsService.getAccountSubscription(user.userId, {
      minimal: fields === 'minimal',
    });
  }

  @Get('subscription/invoices')
  @ApiOperation({ summary: 'Facturas de la suscripción de la cuenta' })
  async getAccountInvoices(@CurrentUser() user: RequestUser) {
    return this.subscriptionsService.getAccountInvoices(user.userId);
  }

  @Get('subscription/summary')
  @ApiOperation({ summary: 'Resumen de suscripción de la cuenta' })
  async getAccountSubscriptionSummary(@CurrentUser() user: RequestUser) {
    return this.subscriptionsService.getAccountSubscriptionSummary(user.userId);
  }
}
