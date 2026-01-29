import {
  Controller,
  Get,
  Param,
  Sse,
  UnauthorizedException,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Public } from '../auth/decorators/public.decorator';
import { KitchenNotificationsService } from './kitchen-notifications.service';
import { OrdersService } from '../orders/orders.service';
import { OrderFiltersDto } from '../orders/dto/order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller('api/restaurants/:restaurantId/kitchen')
export class KitchenController {
  constructor(
    private jwtService: JwtService,
    private kitchenNotifications: KitchenNotificationsService,
    private ordersService: OrdersService,
  ) {}

  @Get('notifications')
  @Sse()
  @Public()
  async notifications(
    @Param('restaurantId') restaurantId: string,
    @Req() req: any,
  ): Promise<Observable<MessageEvent>> {
    // Validar token manualmente antes de establecer conexión SSE
    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Se requiere token de autenticación en header Authorization',
      );
    }

    const token = authHeader.substring(7);

    try {
      // Verificar el token
      const payload = await this.jwtService.verifyAsync(token);

      // Validar que el usuario tenga acceso al restaurante
      if (
        payload.restaurantId !== restaurantId &&
        payload.roleName !== 'SUPER_ADMIN'
      ) {
        throw new UnauthorizedException(
          'No tienes acceso a las notificaciones de este restaurante',
        );
      }

      console.log(
        `✅ Conexión SSE autorizada para restaurante ${restaurantId} - Usuario: ${payload.email}`,
      );

      return this.kitchenNotifications.getNotificationsForRestaurant(
        restaurantId,
      );
    } catch (error) {
      console.error('❌ Error al verificar token SSE:', error.message);
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get orders for kitchen (confirmed, preparing, ready)',
  })
  @ApiResponse({ status: 200, description: 'Orders retrieved successfully' })
  async getOrders(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query() filters: OrderFiltersDto,
  ) {
    // Forzar filtro de status para cocina: CONFIRMED, PREPARING, READY
    const kitchenFilters = {
      ...filters,
      status: 'CONFIRMED,PREPARING,READY',
    };
    return this.ordersService.findAll(
      restaurantId,
      user.userId,
      kitchenFilters,
    );
  }
}
