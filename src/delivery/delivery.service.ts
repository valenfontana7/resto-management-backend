import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
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
  UpdateDriverLocationDto,
  DriverStatsFiltersDto,
  DriverFiltersDto,
  DeliveryStatus,
  UpdateDriverWhatsappDto,
  TestDriverWhatsappDto,
} from './dto/delivery.dto';
import { Prisma } from '@prisma/client';
import { DeliveryZonesService } from './services/delivery-zones.service';
import { DeliveryDriversService } from './services/delivery-drivers.service';
import { DeliveryPricingService } from './services/delivery-pricing.service';
import { GeocodeService } from './services/geocode.service';
import { DeliveryRunService } from './services/delivery-run.service';
import { DeliveryBusinessEventsService } from '../business-events/publishers/delivery-business-events.service';
import { computeLiveDeliveryEta } from './utils/delivery-eta.util';

@Injectable()
export class DeliveryService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => DeliveryZonesService))
    private readonly zonesService: DeliveryZonesService,
    @Inject(forwardRef(() => DeliveryDriversService))
    private readonly driversService: DeliveryDriversService,
    private readonly pricingService: DeliveryPricingService,
    private readonly geocodeService: GeocodeService,
    private readonly deliveryRunService: DeliveryRunService,
    private readonly deliveryEvents: DeliveryBusinessEventsService,
  ) {}

  // ============================================
  // DELIVERY ZONES (delegados)
  // ============================================

  /**
   * @deprecated Usa DeliveryZonesService.getZones() directamente
   */
  async getZones(restaurantId: string) {
    return this.zonesService.getZones(restaurantId);
  }

  async syncZonePolygons(
    restaurantId: string,
    options?: { force?: boolean; zoneId?: string },
  ) {
    return this.zonesService.syncZonePolygons(restaurantId, options);
  }

  async updateZonePolygon(
    restaurantId: string,
    zoneId: string,
    dto: UpdateDeliveryZonePolygonDto,
  ) {
    return this.zonesService.updateZonePolygon(restaurantId, zoneId, dto);
  }

  async clearZonePolygon(restaurantId: string, zoneId: string) {
    return this.zonesService.clearZonePolygon(restaurantId, zoneId);
  }

  /**
   * @deprecated Usa DeliveryZonesService.createZone() directamente
   */
  async createZone(restaurantId: string, dto: CreateDeliveryZoneDto) {
    return this.zonesService.createZone(restaurantId, dto);
  }

  /**
   * @deprecated Usa DeliveryZonesService.updateZone() directamente
   */
  async updateZone(
    restaurantId: string,
    zoneId: string,
    dto: UpdateDeliveryZoneDto,
  ) {
    return this.zonesService.updateZone(restaurantId, zoneId, dto);
  }

  /**
   * @deprecated Usa DeliveryZonesService.deleteZone() directamente
   */
  async deleteZone(restaurantId: string, zoneId: string) {
    return this.zonesService.deleteZone(restaurantId, zoneId);
  }

  async quoteDelivery(
    restaurantId: string,
    dto: {
      type?: 'pickup' | 'delivery';
      address?: string;
      zoneId?: string;
      subtotal?: number;
    },
  ) {
    return this.pricingService.quoteDelivery(restaurantId, dto);
  }

  // ============================================
  // DELIVERY DRIVERS (delegados)
  // ============================================

  /**
   * @deprecated Usa DeliveryDriversService.getDrivers() directamente
   */
  async getDrivers(restaurantId: string, filters: DriverFiltersDto) {
    return this.driversService.getDrivers(restaurantId, filters);
  }

  /**
   * @deprecated Usa DeliveryDriversService.createDriver() directamente
   */
  async createDriver(restaurantId: string, dto: CreateDeliveryDriverDto) {
    return this.driversService.createDriver(restaurantId, dto);
  }

  /**
   * @deprecated Usa DeliveryDriversService.updateDriver() directamente
   */
  async updateDriver(
    restaurantId: string,
    driverId: string,
    dto: UpdateDeliveryDriverDto,
  ) {
    return this.driversService.updateDriver(restaurantId, driverId, dto);
  }

  /**
   * @deprecated Usa DeliveryDriversService.deleteDriver() directamente
   */
  async deleteDriver(restaurantId: string, driverId: string) {
    return this.driversService.deleteDriver(restaurantId, driverId);
  }

  /**
   * @deprecated Usa DeliveryDriversService.getDriverStats() directamente
   */
  async getDriverStats(
    restaurantId: string,
    driverId: string,
    filters: DriverStatsFiltersDto,
  ) {
    return this.driversService.getDriverStats(restaurantId, driverId, filters);
  }

  /**
   * @deprecated Usa DeliveryDriversService.updateDriverLocation() directamente
   */
  async updateDriverLocation(
    restaurantId: string,
    driverId: string,
    dto: UpdateDriverLocationDto,
  ) {
    return this.driversService.updateDriverLocation(
      restaurantId,
      driverId,
      dto,
    );
  }

  /**
   * @deprecated Usa DeliveryDriversService.getDriverLocation() directamente
   */
  async getDriverLocation(restaurantId: string, driverId: string) {
    return this.driversService.getDriverLocation(restaurantId, driverId);
  }

  // ============================================
  // DELIVERY ORDERS
  // ============================================

  async getOrders(restaurantId: string, filters: DeliveryOrderFiltersDto) {
    const where: Prisma.DeliveryOrderWhereInput = {
      order: { restaurantId },
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.driverId) {
      where.driverId = filters.driverId;
    }

    if (filters.date) {
      const date = new Date(filters.date);
      const nextDay = new Date(date);
      nextDay.setDate(date.getDate() + 1);

      where.createdAt = {
        gte: date,
        lt: nextDay,
      };
    }

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 20;
    const skip = (page - 1) * limit;

    const [orders, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where,
        include: {
          order: {
            include: {
              items: {
                include: {
                  dish: true,
                },
              },
            },
          },
          driver: {
            include: {
              locations: {
                orderBy: { timestamp: 'desc' },
                take: 1,
              },
            },
          },
          zone: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);

    // Formatear respuesta
    const formattedOrders = orders.map((delivery) => {
      const latestLocation = delivery.driver?.locations?.[0];
      const liveEta = computeLiveDeliveryEta({
        status: delivery.status,
        driverLat: latestLocation?.lat,
        driverLng: latestLocation?.lng,
        destinationLat:
          delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
        destinationLng:
          delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
        vehicle: delivery.driver?.vehicle,
        locationUpdatedAt: latestLocation?.timestamp,
      });

      return {
        id: delivery.id,
        orderNumber: `ORD-${delivery.order.id.slice(-8).toUpperCase()}`,
        orderId: delivery.orderId,
        customerId: delivery.order.id,
        customerName: delivery.order.customerName,
        customerPhone: delivery.order.customerPhone,
        deliveryAddress: delivery.deliveryAddress,
        deliveryLat:
          delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
        deliveryLng:
          delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
        items: delivery.order.items.map((item) => ({
          dishId: item.dishId,
          dishName: item.dish.name,
          quantity: item.quantity,
          price: item.dish.price,
          notes: item.notes,
        })),
        subtotal: delivery.order.subtotal,
        deliveryFee: delivery.deliveryFee,
        total: delivery.order.total,
        status: delivery.status,
        driverId: delivery.driverId,
        driverName: delivery.driver?.name || null,
        zoneId: delivery.zoneId,
        zoneName: delivery.zone?.name || null,
        estimatedDeliveryTime: delivery.estimatedDeliveryTime,
        liveEtaMinutes: liveEta.liveEtaMinutes,
        distanceKmRemaining: liveEta.distanceKmRemaining,
        distanceKm: delivery.distanceKm,
        paymentMethod: delivery.order.paymentMethod,
        isPaid: delivery.order.paymentStatus === 'PAID',
        readyAt: delivery.readyAt,
        assignedAt: delivery.assignedAt,
        pickedUpAt: delivery.pickedUpAt,
        deliveredAt: delivery.deliveredAt,
        customerNotes: delivery.customerNotes,
        driverNotes: delivery.driverNotes,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
      };
    });

    // Estadísticas de estados
    const stats = await this.getOrderStats(restaurantId);

    return {
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      stats,
    };
  }

  async getOrderById(restaurantId: string, orderId: string) {
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: {
        orderId,
        order: { restaurantId },
      },
      include: {
        order: {
          include: {
            items: {
              include: {
                dish: true,
              },
            },
          },
        },
        driver: true,
        zone: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Pedido de delivery no encontrado');
    }

    // Construir timeline
    const timeline: Array<{
      status: string;
      timestamp: Date;
      note?: string;
      driverId?: string | null;
    }> = [];
    if (delivery.readyAt) {
      timeline.push({
        status: 'ready',
        timestamp: delivery.readyAt,
        note: 'Pedido listo para envío',
      });
    }
    if (delivery.assignedAt && delivery.driver) {
      timeline.push({
        status: 'assigned',
        timestamp: delivery.assignedAt,
        note: `Asignado a ${delivery.driver.name}`,
        driverId: delivery.driverId,
      });
    }
    if (delivery.pickedUpAt) {
      timeline.push({
        status: 'picked-up',
        timestamp: delivery.pickedUpAt,
        note: `${delivery.driver?.name || 'Repartidor'} retiró el pedido`,
      });
    }
    if (delivery.status === 'IN_TRANSIT') {
      timeline.push({
        status: 'in-transit',
        timestamp: new Date(),
        note: 'Pedido en camino',
      });
    }
    if (delivery.deliveredAt) {
      timeline.push({
        status: 'delivered',
        timestamp: delivery.deliveredAt,
        note: 'Pedido entregado',
      });
    }

    return {
      order: {
        id: delivery.id,
        orderNumber: `ORD-${delivery.order.id.slice(-8).toUpperCase()}`,
        orderId: delivery.orderId,
        customerId: delivery.order.id,
        customerName: delivery.order.customerName,
        customerPhone: delivery.order.customerPhone,
        deliveryAddress: delivery.deliveryAddress,
        deliveryLat:
          delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
        deliveryLng:
          delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
        items: delivery.order.items.map((item) => ({
          dishId: item.dishId,
          dishName: item.dish.name,
          quantity: item.quantity,
          price: item.dish.price,
          notes: item.notes,
        })),
        subtotal: delivery.order.subtotal,
        deliveryFee: delivery.deliveryFee,
        total: delivery.order.total,
        status: delivery.status,
        driverId: delivery.driverId,
        driverName: delivery.driver?.name || null,
        zoneId: delivery.zoneId,
        zoneName: delivery.zone?.name || null,
        estimatedDeliveryTime: delivery.estimatedDeliveryTime,
        distanceKm: delivery.distanceKm,
        paymentMethod: delivery.order.paymentMethod,
        isPaid: delivery.order.paymentStatus === 'PAID',
        readyAt: delivery.readyAt,
        assignedAt: delivery.assignedAt,
        pickedUpAt: delivery.pickedUpAt,
        deliveredAt: delivery.deliveredAt,
        customerNotes: delivery.customerNotes,
        driverNotes: delivery.driverNotes,
        createdAt: delivery.createdAt,
        updatedAt: delivery.updatedAt,
        timeline,
      },
    };
  }

  async assignDriver(
    restaurantId: string,
    orderId: string,
    dto: AssignDriverDto,
  ) {
    // Verificar el pedido existe y está en estado READY
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: {
        orderId,
        order: { restaurantId },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Pedido de delivery no encontrado');
    }

    if (delivery.status !== 'READY') {
      throw new BadRequestException(
        `El pedido debe estar en estado READY para asignar un repartidor. Estado actual: ${delivery.status}`,
      );
    }

    // Verificar el repartidor existe y está disponible
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: {
        id: dto.driverId,
        restaurantId,
      },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    if (!driver.isActive) {
      throw new BadRequestException('El repartidor no está activo');
    }

    if (!driver.isAvailable) {
      throw new BadRequestException('El repartidor no está disponible');
    }

    // Verificar límite de pedidos simultáneos (máximo 3)
    const activeOrders = await this.prisma.deliveryOrder.count({
      where: {
        driverId: dto.driverId,
        status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
      },
    });

    if (activeOrders >= 3) {
      throw new BadRequestException(
        'El repartidor ya tiene el máximo de pedidos asignados (3)',
      );
    }

    // Asignar repartidor
    const updated = await this.prisma.deliveryOrder.update({
      where: { id: delivery.id },
      data: {
        driverId: dto.driverId,
        status: 'ASSIGNED',
        assignedAt: new Date(),
      },
      include: {
        driver: true,
        order: true,
      },
    });

    void this.deliveryRunService.notifyAssignment(restaurantId, dto.driverId, {
      orderId: updated.orderId,
      orderNumber: updated.order.orderNumber,
      deliveryAddress: updated.deliveryAddress,
    });

    this.deliveryEvents.publishDeliveryAssigned({
      restaurantId,
      orderId: updated.orderId,
      orderNumber: String(updated.order.orderNumber),
      driverId: dto.driverId,
      driverName: driver.name,
      source: 'delivery.assignDriver',
    });

    return {
      success: true,
      order: updated,
      message: `Pedido asignado a ${driver.name}`,
    };
  }

  async updateStatus(
    restaurantId: string,
    orderId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: {
        orderId,
        order: { restaurantId },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Pedido de delivery no encontrado');
    }

    // Validar transiciones de estado
    this.validateStatusTransition(delivery.status, dto.status);

    const updateData: Prisma.DeliveryOrderUpdateInput = {
      status: dto.status,
    };

    // Actualizar timestamps según el estado
    if (dto.status === DeliveryStatus.READY && !delivery.readyAt) {
      updateData.readyAt = new Date();
    }

    if (dto.status === DeliveryStatus.PICKED_UP && !delivery.pickedUpAt) {
      updateData.pickedUpAt = new Date();
    }

    if (dto.status === DeliveryStatus.DELIVERED && !delivery.deliveredAt) {
      updateData.deliveredAt = new Date();
    }

    if (dto.notes) {
      updateData.driverNotes = dto.notes;
    }

    const updated = await this.prisma.deliveryOrder.update({
      where: { id: delivery.id },
      data: updateData,
      include: {
        driver: { select: { id: true, name: true } },
        order: { select: { orderNumber: true } },
      },
    });

    // Si hay ubicación, actualizarla
    if (dto.lat && dto.lng && delivery.driverId) {
      await this.updateDriverLocation(restaurantId, delivery.driverId, {
        lat: dto.lat,
        lng: dto.lng,
      });
    }

    if (dto.status === DeliveryStatus.DELIVERED) {
      this.deliveryEvents.publishDeliveryCompleted({
        restaurantId,
        orderId,
        orderNumber: String(updated.order.orderNumber),
        driverId: updated.driver?.id,
        driverName: updated.driver?.name,
        source: 'delivery.updateStatus',
      });
    }

    return {
      success: true,
      order: updated,
      updatedAt: new Date(),
    };
  }

  async getStats(restaurantId: string, filters: DeliveryStatsFiltersDto) {
    const { startDate, endDate } = this.getDateRange(
      filters.period || 'today',
      filters.startDate,
      filters.endDate,
    );

    const where: Prisma.DeliveryOrderWhereInput = {
      order: { restaurantId },
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const [total, preparing, pending, inTransit, delivered, cancelled] =
      await Promise.all([
        this.prisma.deliveryOrder.count({ where }),
        this.prisma.deliveryOrder.count({
          where: { ...where, status: 'PENDING' },
        }),
        this.prisma.deliveryOrder.count({
          where: { ...where, status: 'READY' },
        }),
        this.prisma.deliveryOrder.count({
          where: {
            ...where,
            status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
          },
        }),
        this.prisma.deliveryOrder.count({
          where: { ...where, status: 'DELIVERED' },
        }),
        this.prisma.deliveryOrder.count({
          where: { ...where, status: 'CANCELLED' },
        }),
      ]);

    // Tiempo promedio de entrega
    const avgDelivery = await this.prisma.deliveryOrder.aggregate({
      where: { ...where, status: 'DELIVERED' },
      _avg: { estimatedDeliveryTime: true },
    });

    // Revenue total
    const orders = await this.prisma.deliveryOrder.findMany({
      where,
      include: { order: true },
    });

    const totalRevenue = orders.reduce((sum, d) => sum + d.order.total, 0);
    const totalDeliveryFees = orders.reduce((sum, d) => sum + d.deliveryFee, 0);

    // Repartidores activos
    const activeDrivers = await this.prisma.deliveryDriver.count({
      where: { restaurantId, isActive: true, isAvailable: true },
    });

    // Top repartidor
    const driverStats = await this.prisma.deliveryOrder.groupBy({
      by: ['driverId'],
      where: { ...where, status: 'DELIVERED', driverId: { not: null } },
      _count: { id: true },
      _avg: { estimatedDeliveryTime: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    });

    let topDriver: {
      id: string;
      name: string;
      deliveries: number;
      avgTime: number;
    } | null = null;
    if (driverStats.length > 0 && driverStats[0].driverId) {
      const driver = await this.prisma.deliveryDriver.findUnique({
        where: { id: driverStats[0].driverId },
      });
      if (driver) {
        topDriver = {
          id: driver.id,
          name: driver.name,
          deliveries: driverStats[0]._count.id,
          avgTime: Math.round(driverStats[0]._avg.estimatedDeliveryTime || 0),
        };
      }
    }

    // Top zona
    const zoneStats = await this.prisma.deliveryOrder.groupBy({
      by: ['zoneId'],
      where: { ...where, zoneId: { not: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1,
    });

    let topZone: { id: string; name: string; orders: number } | null = null;
    if (zoneStats.length > 0 && zoneStats[0].zoneId) {
      const zone = await this.prisma.deliveryZone.findUnique({
        where: { id: zoneStats[0].zoneId },
      });
      if (zone) {
        topZone = {
          id: zone.id,
          name: zone.name,
          orders: zoneStats[0]._count.id,
        };
      }
    }

    return {
      stats: {
        totalOrders: total,
        preparingOrders: preparing,
        pendingOrders: pending,
        inTransitOrders: inTransit,
        deliveredOrders: delivered,
        cancelledOrders: cancelled,
        avgDeliveryTime: Math.round(
          avgDelivery._avg.estimatedDeliveryTime || 0,
        ),
        totalRevenue,
        totalDeliveryFees,
        activeDrivers,
        topDriver,
        topZone,
      },
    };
  }

  // ============================================
  // PUBLIC TRACKING
  // ============================================

  async getPublicTracking(orderId: string, token?: string) {
    const normalizedToken = String(token || '').trim();
    if (!normalizedToken) {
      throw new ForbiddenException('Token de tracking requerido');
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        publicTrackingToken: true,
        type: true,
        status: true,
        deliveryAddress: true,
        createdAt: true,
      },
    });

    if (
      !order?.publicTrackingToken ||
      order.publicTrackingToken !== normalizedToken
    ) {
      throw new ForbiddenException('Token de tracking inválido');
    }

    if (order.type !== 'DELIVERY') {
      throw new NotFoundException(
        'Este pedido no tiene seguimiento de delivery',
      );
    }

    const orderNumber =
      order.orderNumber || `ORD-${order.id.slice(-8).toUpperCase()}`;

    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: { orderId },
      include: {
        order: true,
        driver: {
          include: {
            locations: {
              orderBy: { timestamp: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!delivery) {
      return {
        order: {
          orderNumber,
          status: 'PENDING',
          orderStatus: order.status,
          estimatedDeliveryTime: null,
          deliveryAddress: order.deliveryAddress || '',
          driver: null,
          timeline: this.buildKitchenOnlyTimeline(order),
        },
      };
    }

    const timeline = this.buildDeliveryTrackingTimeline(delivery);
    const driverLocation = delivery.driver?.locations?.[0] ?? null;
    const liveEta = computeLiveDeliveryEta({
      status: delivery.status,
      driverLat: driverLocation?.lat,
      driverLng: driverLocation?.lng,
      destinationLat:
        delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
      destinationLng:
        delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
      vehicle: delivery.driver?.vehicle,
      locationUpdatedAt: driverLocation?.timestamp,
    });

    return {
      order: {
        orderNumber,
        status: delivery.status,
        orderStatus: delivery.order.status,
        estimatedDeliveryTime: delivery.estimatedDeliveryTime,
        liveEtaMinutes: liveEta.liveEtaMinutes,
        distanceKmRemaining: liveEta.distanceKmRemaining,
        liveEtaUpdatedAt: liveEta.liveEtaUpdatedAt,
        deliveryAddress: delivery.deliveryAddress,
        deliveryLat:
          delivery.deliveryLat != null ? Number(delivery.deliveryLat) : null,
        deliveryLng:
          delivery.deliveryLng != null ? Number(delivery.deliveryLng) : null,
        driver: delivery.driver
          ? {
              name: delivery.driver.name,
              phone: this.maskPhone(delivery.driver.phone),
              vehicle: [delivery.driver.vehicle, delivery.driver.licensePlate]
                .filter(Boolean)
                .join(' ')
                .trim(),
              location: driverLocation
                ? {
                    lat: driverLocation.lat,
                    lng: driverLocation.lng,
                    heading: driverLocation.heading,
                    updatedAt: driverLocation.timestamp,
                  }
                : null,
            }
          : null,
        timeline,
      },
    };
  }

  private buildKitchenOnlyTimeline(order: { createdAt: Date; status: string }) {
    const timeline: Array<{
      status: string;
      timestamp: Date;
      message: string;
    }> = [
      {
        status: 'pending',
        timestamp: order.createdAt,
        message: 'Recibimos tu pedido',
      },
    ];

    if (['CONFIRMED', 'PAID', 'PREPARING'].includes(order.status)) {
      timeline.push({
        status: 'pending',
        timestamp: order.createdAt,
        message: 'Tu pedido está en cocina',
      });
    }

    if (order.status === 'READY') {
      timeline.push({
        status: 'ready',
        timestamp: order.createdAt,
        message: 'Tu pedido está listo y pronto saldrá a entrega',
      });
    }

    if (order.status === 'DELIVERED') {
      timeline.push({
        status: 'delivered',
        timestamp: order.createdAt,
        message: 'Tu pedido fue entregado',
      });
    }

    return timeline;
  }

  private buildDeliveryTrackingTimeline(delivery: {
    status: string;
    createdAt: Date;
    readyAt: Date | null;
    assignedAt: Date | null;
    pickedUpAt: Date | null;
    deliveredAt: Date | null;
    updatedAt: Date;
    driver: { name: string } | null;
  }) {
    const timeline: Array<{
      status: string;
      timestamp: Date;
      message: string;
    }> = [
      {
        status: 'pending',
        timestamp: delivery.createdAt,
        message: 'Recibimos tu pedido',
      },
    ];

    if (delivery.status === 'PENDING' && !delivery.readyAt) {
      timeline.push({
        status: 'pending',
        timestamp: delivery.createdAt,
        message: 'Tu pedido está en cocina',
      });
    }

    if (delivery.readyAt) {
      timeline.push({
        status: 'ready',
        timestamp: delivery.readyAt,
        message: 'Tu pedido está listo para envío',
      });
    }

    if (delivery.assignedAt && delivery.driver) {
      timeline.push({
        status: 'assigned',
        timestamp: delivery.assignedAt,
        message: `${delivery.driver.name} fue asignado a tu pedido`,
      });
    }

    if (delivery.pickedUpAt) {
      timeline.push({
        status: 'picked-up',
        timestamp: delivery.pickedUpAt,
        message: `${delivery.driver?.name || 'El repartidor'} retiró tu pedido`,
      });
    }

    if (delivery.status === 'IN_TRANSIT') {
      timeline.push({
        status: 'in-transit',
        timestamp: delivery.pickedUpAt || delivery.updatedAt,
        message: 'Tu pedido está en camino',
      });
    }

    if (delivery.deliveredAt) {
      timeline.push({
        status: 'delivered',
        timestamp: delivery.deliveredAt,
        message: 'Tu pedido fue entregado',
      });
    }

    if (delivery.status === 'CANCELLED') {
      timeline.push({
        status: 'cancelled',
        timestamp: delivery.updatedAt,
        message: 'La entrega fue cancelada',
      });
    }

    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return timeline;
  }

  // ============================================
  // HELPERS
  // ============================================

  /**
   * Genera un token de tracking HMAC para un orderId dado.
   * Usar para crear URLs públicas de tracking.
   */
  static generateTrackingToken(orderId: string): string {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('crypto');
    const secret = process.env.JWT_SECRET || 'default-secret';
    return crypto
      .createHmac('sha256', secret)
      .update(orderId)
      .digest('hex')
      .slice(0, 16);
  }

  private validateStatusTransition(
    currentStatus: string,
    newStatus: DeliveryStatus,
  ) {
    const validTransitions = {
      PENDING: ['READY', 'CANCELLED'],
      READY: ['ASSIGNED', 'CANCELLED'],
      ASSIGNED: ['PICKED_UP', 'CANCELLED'],
      PICKED_UP: ['IN_TRANSIT', 'CANCELLED'],
      IN_TRANSIT: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
      CANCELLED: [],
    };

    if (!validTransitions[currentStatus]?.includes(newStatus)) {
      throw new BadRequestException(
        `Transición de estado inválida: ${currentStatus} → ${newStatus}`,
      );
    }
  }

  private getDateRange(
    period: string,
    customStart?: string,
    customEnd?: string,
  ) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;

      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;

      case 'month':
        startDate = new Date(now);
        startDate.setMonth(now.getMonth() - 1);
        break;

      case 'custom':
        if (!customStart || !customEnd) {
          throw new BadRequestException(
            'startDate y endDate son requeridos para period=custom',
          );
        }
        startDate = new Date(customStart);
        endDate = new Date(customEnd);
        break;

      default:
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
    }

    return { startDate, endDate };
  }

  private groupByDay(deliveries: any[]) {
    const grouped = {};
    deliveries.forEach((d) => {
      const date = d.createdAt.toISOString().split('T')[0];
      grouped[date] = (grouped[date] || 0) + 1;
    });

    return Object.entries(grouped).map(([date, count]) => ({
      date,
      count,
    }));
  }

  private groupByHour(deliveries: any[]) {
    const grouped = {};
    deliveries.forEach((d) => {
      const hour = d.createdAt.getHours().toString();
      grouped[hour] = (grouped[hour] || 0) + 1;
    });
    return grouped;
  }

  private async getOrderStats(restaurantId: string) {
    const [ready, assigned, inTransit, delivered] = await Promise.all([
      this.prisma.deliveryOrder.count({
        where: {
          order: { restaurantId },
          status: 'READY',
        },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          order: { restaurantId },
          status: 'ASSIGNED',
        },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          order: { restaurantId },
          status: 'IN_TRANSIT',
        },
      }),
      this.prisma.deliveryOrder.count({
        where: {
          order: { restaurantId },
          status: 'DELIVERED',
        },
      }),
    ]);

    return { ready, assigned, inTransit, delivered };
  }

  async geocodeAddress(query: string) {
    const coordinates = await this.geocodeService.geocode(query);
    return {
      query: query.trim(),
      coordinates,
    };
  }

  async geocodeAddressesBatch(queries: string[]) {
    const results = await this.geocodeService.geocodeBatch(queries);
    return { results };
  }

  async geocodeMissingOrderCoordinates(restaurantId: string, limit = 15) {
    const missing = await this.prisma.deliveryOrder.findMany({
      where: {
        order: { restaurantId },
        deliveryAddress: { not: '' },
        OR: [{ deliveryLat: null }, { deliveryLng: null }],
      },
      include: {
        order: {
          select: {
            restaurant: { select: { city: true, country: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    let updated = 0;

    for (const delivery of missing) {
      const coordinates =
        await this.geocodeService.coordinatesForDeliveryAddress(
          delivery.deliveryAddress,
          {
            city: delivery.order.restaurant.city,
            country: delivery.order.restaurant.country,
          },
        );

      if (coordinates.deliveryLat == null || coordinates.deliveryLng == null) {
        continue;
      }

      await this.prisma.deliveryOrder.update({
        where: { id: delivery.id },
        data: coordinates,
      });
      updated += 1;

      if (updated < missing.length) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    const remaining = await this.prisma.deliveryOrder.count({
      where: {
        order: { restaurantId },
        deliveryAddress: { not: '' },
        OR: [{ deliveryLat: null }, { deliveryLng: null }],
      },
    });

    return { updated, remaining };
  }

  getRunSession(restaurantId: string, userId: string) {
    return this.deliveryRunService.getSession(restaurantId, userId);
  }

  linkRunDriver(
    restaurantId: string,
    userId: string,
    userRole: string | undefined,
    driverId: string,
  ) {
    return this.deliveryRunService.linkDriver(restaurantId, userId, userRole, {
      driverId,
    });
  }

  updateRunOrderStatus(
    restaurantId: string,
    userId: string,
    orderId: string,
    dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryRunService.updateOrderStatus(
      restaurantId,
      userId,
      orderId,
      dto,
    );
  }

  updateRunLocation(
    restaurantId: string,
    userId: string,
    dto: UpdateDriverLocationDto,
  ) {
    return this.deliveryRunService.updateLocation(restaurantId, userId, dto);
  }

  updateDriverWhatsapp(
    restaurantId: string,
    userId: string,
    dto: UpdateDriverWhatsappDto,
  ) {
    return this.deliveryRunService.updateDriverWhatsapp(
      restaurantId,
      userId,
      dto,
    );
  }

  testDriverWhatsapp(
    restaurantId: string,
    userId: string,
    dto: TestDriverWhatsappDto,
  ) {
    return this.deliveryRunService.testDriverWhatsapp(
      restaurantId,
      userId,
      dto,
    );
  }

  private maskPhone(phone: string): string {
    if (phone.length <= 8) return phone;
    return phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4);
  }
}
