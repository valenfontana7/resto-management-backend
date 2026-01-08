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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { Public } from '../auth/decorators/public.decorator';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
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

  // ============================================
  // DELIVERY ORDERS - 5 endpoints
  // ============================================

  @Get('orders')
  @ApiOperation({ summary: 'Listar pedidos delivery con filtros' })
  @ApiResponse({ status: 200, description: 'Lista de pedidos delivery' })
  async getOrders(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Query() filters: DeliveryOrderFiltersDto,
  ) {
    return this.deliveryService.getOrders(restaurantId, filters);
  }

  @Get('orders/:orderId')
  @ApiOperation({ summary: 'Obtener pedido delivery por ID' })
  @ApiResponse({ status: 200, description: 'Detalles del pedido' })
  async getOrderById(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
  ) {
    return this.deliveryService.getOrderById(restaurantId, orderId);
  }

  @Post('orders/:orderId/assign')
  @ApiOperation({ summary: 'Asignar repartidor a pedido' })
  @ApiResponse({
    status: 200,
    description: 'Repartidor asignado exitosamente',
  })
  async assignDriver(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: AssignDriverDto,
  ) {
    return this.deliveryService.assignDriver(restaurantId, orderId, dto);
  }

  @Patch('orders/:orderId/status')
  @ApiOperation({ summary: 'Actualizar estado del delivery' })
  @ApiResponse({ status: 200, description: 'Estado actualizado' })
  async updateStatus(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.updateStatus(restaurantId, orderId, dto);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Estadísticas de delivery' })
  @ApiResponse({ status: 200, description: 'Estadísticas generales' })
  async getStats(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Query() filters: DeliveryStatsFiltersDto,
  ) {
    return this.deliveryService.getStats(restaurantId, filters);
  }

  // ============================================
  // DELIVERY DRIVERS - 6 endpoints
  // ============================================

  @Get('drivers')
  @ApiOperation({ summary: 'Listar repartidores' })
  @ApiResponse({ status: 200, description: 'Lista de repartidores' })
  async getDrivers(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Query() filters: DriverFiltersDto,
  ) {
    return this.deliveryService.getDrivers(restaurantId, filters);
  }

  @Post('drivers')
  @ApiOperation({ summary: 'Crear repartidor' })
  @ApiResponse({ status: 201, description: 'Repartidor creado' })
  async createDriver(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() dto: CreateDeliveryDriverDto,
  ) {
    return this.deliveryService.createDriver(restaurantId, dto);
  }

  @Put('drivers/:driverId')
  @ApiOperation({ summary: 'Actualizar repartidor' })
  @ApiResponse({ status: 200, description: 'Repartidor actualizado' })
  async updateDriver(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDeliveryDriverDto,
  ) {
    return this.deliveryService.updateDriver(restaurantId, driverId, dto);
  }

  @Delete('drivers/:driverId')
  @ApiOperation({ summary: 'Eliminar repartidor' })
  @ApiResponse({ status: 200, description: 'Repartidor eliminado' })
  async deleteDriver(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
  ) {
    return this.deliveryService.deleteDriver(restaurantId, driverId);
  }

  @Get('drivers/:driverId/stats')
  @ApiOperation({ summary: 'Estadísticas de repartidor' })
  @ApiResponse({
    status: 200,
    description: 'Estadísticas del repartidor',
  })
  async getDriverStats(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @Query() filters: DriverStatsFiltersDto,
  ) {
    return this.deliveryService.getDriverStats(restaurantId, driverId, filters);
  }

  @Post('drivers/:driverId/location')
  @ApiOperation({ summary: 'Actualizar ubicación del repartidor' })
  @ApiResponse({ status: 200, description: 'Ubicación actualizada' })
  async updateDriverLocation(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
    @Body() dto: UpdateDriverLocationDto,
  ) {
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
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('driverId') driverId: string,
  ) {
    return this.deliveryService.getDriverLocation(restaurantId, driverId);
  }

  // ============================================
  // DELIVERY ZONES - 4 endpoints
  // ============================================

  @Get('zones')
  @ApiOperation({ summary: 'Listar zonas de delivery' })
  @ApiResponse({ status: 200, description: 'Lista de zonas' })
  async getZones(@VerifyRestaurantAccess('restaurantId') restaurantId: string) {
    return this.deliveryService.getZones(restaurantId);
  }

  @Post('zones')
  @ApiOperation({ summary: 'Crear zona de delivery' })
  @ApiResponse({ status: 201, description: 'Zona creada' })
  async createZone(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Body() dto: CreateDeliveryZoneDto,
  ) {
    return this.deliveryService.createZone(restaurantId, dto);
  }

  @Put('zones/:zoneId')
  @ApiOperation({ summary: 'Actualizar zona de delivery' })
  @ApiResponse({ status: 200, description: 'Zona actualizada' })
  async updateZone(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateDeliveryZoneDto,
  ) {
    return this.deliveryService.updateZone(restaurantId, zoneId, dto);
  }

  @Delete('zones/:zoneId')
  @ApiOperation({ summary: 'Eliminar zona de delivery' })
  @ApiResponse({ status: 200, description: 'Zona eliminada' })
  async deleteZone(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
  ) {
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
    return this.deliveryService.getPublicTracking(orderId);
  }
}
