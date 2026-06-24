import {
  Controller,
  Get,
  Param,
  Sse,
  UnauthorizedException,
  Req,
  UseGuards,
  Query,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { KitchenNotificationsService } from './kitchen-notifications.service';
import { OrdersService } from '../orders/orders.service';
import { OrderFiltersDto } from '../orders/dto/order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { OwnershipService } from '../common/services/ownership.service';
import { getClientIp } from '../common/utils/client-ip.util';
import { normalizeRoleCode } from '../common/utils/role.utils';

const KITCHEN_SSE_ROLES = new Set([
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'CHEF',
  'WAITER',
]);

@ApiTags('kitchen')
@ApiBearerAuth()
@Controller('api/restaurants/:restaurantId/kitchen')
export class KitchenController {
  private readonly logger = new Logger(KitchenController.name);

  constructor(
    private jwtService: JwtService,
    private kitchenNotifications: KitchenNotificationsService,
    private ordersService: OrdersService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
    private readonly ownership: OwnershipService,
  ) {}

  @Get('notifications')
  @Sse()
  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 15 } })
  async notifications(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'kitchen_sse',
      restaurantId,
    });

    const authHeader = req.headers.authorization || req.headers.Authorization;

    if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Se requiere token de autenticación en header Authorization',
      );
    }

    const token = String(authHeader).substring(7);

    try {
      const payload = await this.jwtService.verifyAsync(token);
      const roleName = normalizeRoleCode(payload.roleName);

      if (
        roleName !== 'SUPER_ADMIN' &&
        !KITCHEN_SSE_ROLES.has(roleName ?? '')
      ) {
        throw new UnauthorizedException(
          'No tienes permiso para acceder a cocina',
        );
      }

      await this.ownership.verifyUserBelongsToRestaurant(
        restaurantId,
        payload.sub,
      );

      this.logger.log(
        `Conexión SSE autorizada para restaurante ${restaurantId} - Usuario: ${payload.email}`,
      );

      return this.kitchenNotifications.getNotificationsForRestaurant(
        restaurantId,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Token inválido o expirado';
      this.logger.warn(`Error al verificar token SSE: ${message}`);
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
