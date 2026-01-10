import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
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
  async getSubscription(@Param('restaurantId') restaurantId: string) {
    return this.subscriptionsService.getSubscription(restaurantId);
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
  ) {
    return this.subscriptionsService.updateSubscription(restaurantId, dto);
  }

  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Suscripción cancelada' })
  @ApiResponse({ status: 404, description: 'No existe suscripción' })
  async cancelSubscription(@Param('restaurantId') restaurantId: string) {
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
  async reactivateSubscription(@Param('restaurantId') restaurantId: string) {
    return this.subscriptionsService.reactivateSubscription(restaurantId);
  }

  @Get('invoices')
  @ApiOperation({ summary: 'Obtener facturas de la suscripción' })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({ status: 200, description: 'Lista de facturas' })
  async getInvoices(@Param('restaurantId') restaurantId: string) {
    return this.subscriptionsService.getInvoices(restaurantId);
  }
}
