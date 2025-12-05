import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import {
  CreateDeliveryZoneDto,
  UpdateDeliveryZoneDto,
  CreateDeliveryDriverDto,
  UpdateDeliveryDriverDto,
  AssignDriverDto,
  UpdateDeliveryStatusDto,
  DeliveryOrderFiltersDto,
  DeliveryStatsFiltersDto,
  UpdateDriverLocationDto,
  DriverStatsFiltersDto,
  DriverFiltersDto,
} from './dto/delivery.dto';

@ApiTags('Delivery')
@Controller('api/restaurants/:restaurantId/delivery')
@ApiBearerAuth()
export class DeliveryController {
  constructor(private deliveryService: DeliveryService) {}

  // Verificar ownership del restaurante
  private checkOwnership(user: RequestUser, restaurantId: string) {
    if (user.restaurantId !== restaurantId) {
      throw new ForbiddenException(
        'No tienes permisos para acceder a este restaurante',
      );
    }
  }

  // ============================================
  // DELIVERY ORDERS - 5 endpoints
  // ============================================

  @Get('orders')
  @ApiOperation({ summary: 'Listar pedidos delivery con filtros' })
  @ApiResponse({ status: 200, description: 'Lista de pedidos delivery' })
  async getOrders(
    @Param('restaurantId') restaurantId: string,
    @Query() filters: DeliveryOrderFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getOrders(restaurantId, filters);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Obtener pedido delivery por ID' })
  @ApiResponse({ status: 200, description: 'Detalles del pedido' })
  async getOrderById(
    @Param('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getOrderById(restaurantId, orderId);
  }

  @Post('orders/:orderId/assign')
  @ApiOperation({ summary: 'Asignar repartidor a pedido' })
  @ApiResponse({
    status: 200,
    description: 'Repartidor asignado exitosamente',
  })
  async assignDriver(
    @Param('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AssignDriverDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.assignDriver(restaurantId, orderId, dto);
  }

  @Patch('orders/:orderId/status')
  @ApiOperation({ summary: 'Actualizar estado del delivery' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  async updateStatus(
    @Param('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.updateStatus(restaurantId, orderId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas de delivery' })
  @ApiResponse({ status: 200, description: 'Estadísticas generales' })
  async getStats(
    @Param('restaurantId') restaurantId: string,
    @Query() filters: DeliveryStatsFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getStats(restaurantId, filters);
  }

  // ============================================
  // DELIVERY DRIVERS - 6 endpoints
  // ============================================

  @Get('drivers')
  @ApiOperation({ summary: 'Listar repartidores' })
  @ApiResponse({ status: 200, description: 'Lista de repartidores' })
  async getDrivers(
    @Param('restaurantId') restaurantId: string,
    @Query() filters: DriverFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getDrivers(restaurantId, filters);
  }

  @Post('drivers')
  @ApiOperation({ summary: 'Crear repartidor' })
  @ApiResponse({ status: 201, description: 'Repartidor creado' })
  async createDriver(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateDeliveryDriverDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.createDriver(restaurantId, dto);
  }

  @Put('drivers/:driverId')
  @ApiOperation({ summary: 'Actualizar repartidor' })
  @ApiResponse({ status: 200, description: 'Repartidor actualizado' })
  async updateDriver(
    @Param('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDeliveryDriverDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.updateDriver(restaurantId, driverId, dto);
  }

  @Delete('drivers/:driverId')
  @ApiOperation({ summary: 'Eliminar repartidor' })
  @ApiResponse({ status: 200, description: 'Repartidor eliminado' })
  async deleteDriver(
    @Param('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.deleteDriver(restaurantId, driverId);
  }

  @Get('drivers/:driverId/stats')
  @ApiOperation({ summary: 'Estadísticas de repartidor' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas del repartidor',
  })
  async getDriverStats(
    @Param('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @Query() filters: DriverStatsFiltersDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getDriverStats(restaurantId, driverId, filters);
  }

  @Post('drivers/:driverId/location')
  @ApiOperation({ summary: 'Actualizar ubicación del repartidor' })
  @ApiResponse({ status: 200, description: 'Ubicación actualizada' })
  async updateDriverLocation(
    @Param('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverLocationDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.updateDriverLocation(
      restaurantId,
      driverId,
      dto,
    );
  }

  @Get('drivers/:driverId/location')
  @ApiOperation({ summary: 'Obtener ubicación actual del repartidor' })
  @ApiResponse({ status: 200, description: 'Ubicación del repartidor' })
  async getDriverLocation(
    @Param('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getDriverLocation(restaurantId, driverId);
  }

  // ============================================
  // DELIVERY ZONES - 4 endpoints
  // ============================================

  @Get('zones')
  @ApiOperation({ summary: 'Listar zonas de delivery' })
  @ApiResponse({ status: 200, description: 'Lista de zonas' })
  async getZones(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.getZones(restaurantId);
  }

  @Post('zones')
  @ApiOperation({ summary: 'Crear zona de delivery' })
  @ApiResponse({ status: 201, description: 'Zona creada' })
  async createZone(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateDeliveryZoneDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.createZone(restaurantId, dto);
  }

  @Put('zones/:zoneId')
  @ApiOperation({ summary: 'Actualizar zona de delivery' })
  @ApiResponse({ status: 200, description: 'Zona actualizada' })
  async updateZone(
    @Param('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateDeliveryZoneDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.updateZone(restaurantId, zoneId, dto);
  }

  @Delete('zones/:zoneId')
  @ApiOperation({ summary: 'Eliminar zona de delivery' })
  @ApiResponse({ status: 200, description: 'Zona eliminada' })
  async deleteZone(
    @Param('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
    @CurrentUser() user: RequestUser,
  ) {
    this.checkOwnership(user, restaurantId);
    return this.deliveryService.deleteZone(restaurantId, zoneId);
  }
}

// ============================================
// PUBLIC TRACKING CONTROLLER
// ============================================

@ApiTags('Public Tracking')
@Controller('api/tracking')
export class TrackingController {
  constructor(private deliveryService: DeliveryService) {}

  @Public()
  @Get(':orderId')
  @ApiOperation({
    summary: 'Tracking público del pedido (no requiere autenticación)',
  })
  @ApiResponse({ status: 200, description: 'Estado del pedido' })
  async getPublicTracking(
    @Param('orderId') orderId: string,
    @Query('token') token: string,
  ) {
    return this.deliveryService.getPublicTracking(orderId, token);
  }
}
