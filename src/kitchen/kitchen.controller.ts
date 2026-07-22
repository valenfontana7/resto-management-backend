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
  Optional,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
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
import { KitchenStationsService } from './kitchen-stations.service';
import { OrdersService } from '../orders/orders.service';
import { OrderFiltersDto } from '../orders/dto/order.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnershipService } from '../common/services/ownership.service';
import {
  RestaurantIdParam,
  RestaurantOwnerGuard,
} from '../common/guards/restaurant-owner.guard';
import { normalizeRoleCode } from '../common/utils/role.utils';
import { ExecutionContextService } from '../common/execution/execution-context.service';
import { LabBusinessDateService } from '../bentoo-lab/config/lab-business-date.service';
import { enrichOrderWithKitchenDelay } from './utils/kitchen-order-delay.util';

const KITCHEN_SSE_ROLES = new Set([
  'SUPER_ADMIN',
  'OWNER',
  'MANAGER',
  'CHEF',
  'WAITER',
]);

@ApiTags('kitchen')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RestaurantOwnerGuard)
@RestaurantIdParam('restaurantId')
@Controller('api/restaurants/:restaurantId/kitchen')
export class KitchenController {
  private readonly logger = new Logger(KitchenController.name);

  constructor(
    private jwtService: JwtService,
    private kitchenNotifications: KitchenNotificationsService,
    private kitchenStations: KitchenStationsService,
    private ordersService: OrdersService,
    private readonly ownership: OwnershipService,
    private readonly executionContext: ExecutionContextService,
    @Optional() private readonly labBusinessDate?: LabBusinessDateService,
  ) {}

  @Get('notifications')
  @Sse()
  @Public()
  @SkipThrottle()
  async notifications(
    @Param('restaurantId') restaurantId: string,
    @Req() req: Request,
  ): Promise<Observable<MessageEvent>> {
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
    const result = await this.ordersService.findAll(
      restaurantId,
      user.userId,
      kitchenFilters,
    );
    const now = await this.resolveKitchenNow(restaurantId);
    return {
      ...result,
      orders: (result.orders ?? []).map((order) =>
        enrichOrderWithKitchenDelay(order, now),
      ),
    };
  }

  /**
   * ALS Lab (participantes) → HITL Lab (run del tenant) → wall-clock.
   */
  private async resolveKitchenNow(restaurantId: string): Promise<Date> {
    const alsNow = this.executionContext.get()?.simulatedNow;
    if (alsNow) {
      return new Date(alsNow);
    }
    const labNow =
      await this.labBusinessDate?.resolveSimulatedNow(restaurantId);
    return labNow ?? new Date();
  }

  @Get('stations')
  @ApiOperation({ summary: 'KDS v2 — estaciones de cocina configuradas' })
  getStations(@Param('restaurantId') restaurantId: string) {
    return this.kitchenStations.getStations(restaurantId);
  }

  @Get('station-items')
  @ApiOperation({ summary: 'KDS v2 — ítems agrupados por estación' })
  getStationItems(
    @Param('restaurantId') restaurantId: string,
    @Query('stationId') stationId?: string,
  ) {
    return this.kitchenStations.getItemsByStation(restaurantId, stationId);
  }
}
