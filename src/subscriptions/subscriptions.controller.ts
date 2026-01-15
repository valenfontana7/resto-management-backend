import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { assertRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import {
  CreateSubscriptionDto,
  CreateCheckoutDto,
  UpdateSubscriptionDto,
} from './dto';

@ApiTags('subscriptions')
@ApiBearerAuth()
@Controller('api/restaurants/:restaurantId/subscription')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  @ApiOperation({ summary: 'Obtener suscripción actual del restaurante' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Suscripción encontrada' })
  @ApiResponse({ status: 404, description: 'No existe suscripción' })
  async getSubscription(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.subscriptionsService.getSubscription(
      restaurantId,
      user?.userId,
    );
  }

  @Get('summary')
  @ApiOperation({ summary: 'Obtener resumen de suscripción con métricas' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Resumen de suscripción' })
  async getSubscriptionSummary(@Param('restaurantId') restaurantId: string) {
    return this.subscriptionsService.getSubscriptionSummary(restaurantId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear nueva suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 201, description: 'Suscripción creada' })
  @ApiResponse({ status: 409, description: 'Ya existe suscripción activa' })
  async createSubscription(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateSubscriptionDto,
  ) {
    return this.subscriptionsService.createSubscription(restaurantId, dto);
  }

  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Crear checkout de MercadoPago para suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'URL de checkout generada' })
  @ApiResponse({
    status: 400,
    description: 'Plan gratuito no requiere checkout',
  })
  async createCheckout(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.subscriptionsService.createCheckout(restaurantId, dto);
  }

  @Patch()
  @ApiOperation({ summary: 'Actualizar plan de suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Plan actualizado' })
  @ApiResponse({ status: 404, description: 'No existe suscripción' })
  async updateSubscription(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: UpdateSubscriptionDto,
    @CurrentUser() user: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    return this.subscriptionsService.updateSubscription(restaurantId, dto);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Suscripción cancelada' })
  @ApiResponse({ status: 404, description: 'No existe suscripción' })
  async cancelSubscription(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    return this.subscriptionsService.cancelSubscription(restaurantId);
  }

  @Post('reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reactivar suscripción cancelada' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Suscripción reactivada' })
  @ApiResponse({
    status: 400,
    description: 'La suscripción no puede ser reactivada',
  })
  async reactivateSubscription(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    return this.subscriptionsService.reactivateSubscription(restaurantId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Obtener facturas de la suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de facturas' })
  async getInvoices(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    return this.subscriptionsService.getInvoices(restaurantId);
  }

  @Post('payment-methods')
  @HttpCode(HttpStatus.CREATED)
  async addPaymentMethod(
    @Param('restaurantId') restaurantId: string,
    @Body() body: { token?: string },
    @CurrentUser() user?: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);

    const token = (body?.token ?? '').trim();
    if (!token) {
      return { error: 'token es requerido' };
    }

    return this.subscriptionsService.addPaymentMethodFromToken(
      restaurantId,
      token,
    );
  }

  @Get('payment-methods')
  async listPaymentMethods(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    return this.subscriptionsService.listPaymentMethods(restaurantId);
  }

  @Delete('payment-methods/:paymentMethodId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePaymentMethod(
    @Param('restaurantId') restaurantId: string,
    @Param('paymentMethodId') paymentMethodId: string,
    @CurrentUser() user?: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    await this.subscriptionsService.removePaymentMethod(
      restaurantId,
      paymentMethodId,
    );
    return;
  }

  @Post('payment-methods/select')
  @HttpCode(HttpStatus.OK)
  async selectPaymentMethod(
    @Param('restaurantId') restaurantId: string,
    @Body()
    body: {
      subscriptionPaymentMethodId?: string;
      userPaymentMethodId?: string;
    },
    @CurrentUser() user?: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);
    return this.subscriptionsService.setPreferredPaymentMethod(
      restaurantId,
      body,
      user?.userId,
    );
  }

  @Post('mercadopago/customer')
  @HttpCode(HttpStatus.CREATED)
  async createMpCustomer(
    @Param('restaurantId') restaurantId: string,
    @Body() body: { email?: string; name?: string },
    @CurrentUser() user?: RequestUser,
  ) {
    assertRestaurantAccess(user, restaurantId);

    const metadata: any = {};
    if (body?.email) metadata.email = body.email;
    if (body?.name) metadata.description = body.name;

    const mpCustomerId = await this.subscriptionsService.ensureMpCustomer(
      restaurantId,
      metadata,
    );

    return { mpCustomerId };
  }
}
