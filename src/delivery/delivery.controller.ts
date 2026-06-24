import {
  Controller,
  Get,
  Post,
  HttpCode,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DeliveryService } from './delivery.service';
import { Public } from '../auth/decorators/public.decorator';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  CreateDeliveryZoneDto,
  UpdateDeliveryZoneDto,
  UpdateDeliveryZonePolygonDto,
  CreateDeliveryDriverDto,
  UpdateDeliveryDriverDto,
  AssignDriverDto,
  UpdateDeliveryStatusDto,
  DeliveryOrderFiltersDto,
  DeliveryStatsFiltersDto,
  QuoteDeliveryDto,
  UpdateDriverLocationDto,
  DriverStatsFiltersDto,
  DriverFiltersDto,
  GeocodeBatchDto,
  LinkDeliveryDriverDto,
  TestDriverWhatsappDto,
  UpdateDriverWhatsappDto,
} from './dto/delivery.dto';

@ApiTags('Delivery')
@Controller('api/restaurants/:restaurantId/delivery')
@ApiBearerAuth()
export class DeliveryController {
  constructor(
    private deliveryService: DeliveryService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Public()
  @Post('quote')
  @HttpCode(200)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({ summary: 'Cotizar delivery públicamente' })
  @ApiResponse({ status: 200, description: 'Cotización calculada' })
  async quoteDelivery(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: QuoteDeliveryDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('delivery.quote', { restaurantId });
      await this.botDefense.applyBotDelayMs();
      return {
        available: false,
        type: dto.type === 'pickup' ? 'pickup' : 'delivery',
        provider: 'internal',
        deliveryFee: 0,
        estimatedTime: null,
        zone: null,
        zones: [],
        requiresZoneSelection: false,
        matchedBy: 'none',
      };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'delivery_quote',
      restaurantId,
    });

    return this.deliveryService.quoteDelivery(restaurantId, dto);
  }

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

  @Post('zones/sync-polygons')
  @ApiOperation({ summary: 'Generar polígonos de zonas para el mapa' })
  @ApiResponse({ status: 200, description: 'Polígonos sincronizados' })
  async syncZonePolygons(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Query('force') force?: string,
    @Query('zoneId') zoneId?: string,
  ) {
    return this.deliveryService.syncZonePolygons(restaurantId, {
      force: force === 'true' || force === '1',
      zoneId: zoneId?.trim() || undefined,
    });
  }

  @Patch('zones/:zoneId/polygon')
  @ApiOperation({ summary: 'Guardar polígono manual de una zona' })
  async updateZonePolygon(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
    @Body() dto: UpdateDeliveryZonePolygonDto,
  ) {
    return this.deliveryService.updateZonePolygon(restaurantId, zoneId, dto);
  }

  @Delete('zones/:zoneId/polygon')
  @ApiOperation({ summary: 'Eliminar polígono guardado de una zona' })
  async clearZonePolygon(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @Param('zoneId') zoneId: string,
  ) {
    return this.deliveryService.clearZonePolygon(restaurantId, zoneId);
  }

  @Get('geocode')
  @ApiOperation({
    summary: 'Geocodificar una dirección para el mapa de delivery',
  })
  @ApiResponse({ status: 200, description: 'Coordenadas encontradas o null' })
  async geocodeAddress(
    @VerifyRestaurantAccess('restaurantId') _restaurantId: string,
    @Query('q') query: string,
  ) {
    return this.deliveryService.geocodeAddress(query || '');
  }

  @Post('geocode/batch')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Geocodificar múltiples direcciones para el mapa de delivery',
  })
  @ApiResponse({ status: 200, description: 'Mapa de dirección → coordenadas' })
  async geocodeAddressesBatch(
    @VerifyRestaurantAccess('restaurantId') _restaurantId: string,
    @Body() dto: GeocodeBatchDto,
  ) {
    return this.deliveryService.geocodeAddressesBatch(dto.queries);
  }

  @Post('orders/geocode-missing')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Geocodificar pedidos delivery sin coordenadas guardadas',
  })
  @ApiResponse({
    status: 200,
    description: 'Cantidad actualizada y pendientes',
  })
  async geocodeMissingOrderCoordinates(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
  ) {
    return this.deliveryService.geocodeMissingOrderCoordinates(restaurantId);
  }

  @Get('run/session')
  @ApiOperation({
    summary: 'Sesión del repartidor — pedidos activos y vínculo de perfil',
  })
  async getRunSession(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.deliveryService.getRunSession(restaurantId, user.userId);
  }

  @Post('run/link')
  @HttpCode(200)
  @ApiOperation({ summary: 'Vincular usuario autenticado con un repartidor' })
  async linkRunDriver(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: LinkDeliveryDriverDto,
  ) {
    return this.deliveryService.linkRunDriver(
      restaurantId,
      user.userId,
      user.role,
      dto.driverId,
    );
  }

  @Patch('run/orders/:orderId/status')
  @ApiOperation({
    summary: 'Actualizar estado de un pedido asignado al repartidor',
  })
  async updateRunOrderStatus(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.updateRunOrderStatus(
      restaurantId,
      user.userId,
      orderId,
      dto,
    );
  }

  @Post('run/location')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reportar ubicación GPS del repartidor' })
  async updateRunLocation(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateDriverLocationDto,
  ) {
    return this.deliveryService.updateRunLocation(
      restaurantId,
      user.userId,
      dto,
    );
  }

  @Patch('run/whatsapp')
  @ApiOperation({
    summary: 'Configurar WhatsApp CallMeBot del repartidor vinculado',
  })
  async updateRunWhatsapp(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateDriverWhatsappDto,
  ) {
    return this.deliveryService.updateDriverWhatsapp(
      restaurantId,
      user.userId,
      dto,
    );
  }

  @Post('run/whatsapp/test')
  @HttpCode(200)
  @ApiOperation({ summary: 'Enviar WhatsApp de prueba al repartidor' })
  async testRunWhatsapp(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: TestDriverWhatsappDto,
  ) {
    return this.deliveryService.testDriverWhatsapp(
      restaurantId,
      user.userId,
      dto,
    );
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
    summary: 'Tracking público del pedido (requiere token de tracking)',
  })
  @ApiResponse({ status: 200, description: 'Estado del pedido' })
  @ApiResponse({ status: 403, description: 'Token inválido o faltante' })
  async getPublicTracking(
    @Param('orderId') orderId: string,
    @Query('token') token: string,
  ) {
    return this.deliveryService.getPublicTracking(orderId, token);
  }
}
