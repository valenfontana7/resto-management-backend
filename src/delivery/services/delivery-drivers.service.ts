import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateDeliveryDriverDto,
  UpdateDeliveryDriverDto,
  UpdateDriverLocationDto,
  DriverStatsFiltersDto,
  DriverFiltersDto,
} from '../dto/delivery.dto';

/**
 * Servicio para gestión de conductores de delivery.
 * Extraído de DeliveryService para cumplir con SRP (SOLID).
 */
@Injectable()
export class DeliveryDriversService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtener todos los conductores con estadísticas
   */
  async getDrivers(restaurantId: string, filters: DriverFiltersDto) {
    const where: Prisma.DeliveryDriverWhereInput = { restaurantId };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }
    if (filters.isAvailable !== undefined) {
      where.isAvailable = filters.isAvailable;
    }

    const drivers = await this.prisma.deliveryDriver.findMany({
      where,
      include: {
        _count: {
          select: { deliveryOrders: true },
        },
        locations: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { name: 'asc' },
    });

    // Agregar estadísticas para cada repartidor
    const driversWithStats = await Promise.all(
      drivers.map(async (driver) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentOrders = await this.prisma.deliveryOrder.count({
          where: {
            driverId: driver.id,
            status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
          },
        });

        const deliveriesToday = await this.prisma.deliveryOrder.count({
          where: {
            driverId: driver.id,
            createdAt: { gte: today },
            status: 'DELIVERED',
          },
        });

        const avgTime = await this.prisma.deliveryOrder.aggregate({
          where: {
            driverId: driver.id,
            status: 'DELIVERED',
          },
          _avg: {
            estimatedDeliveryTime: true,
          },
        });

        return {
          id: driver.id,
          name: driver.name,
          phone: driver.phone,
          email: driver.email,
          vehicle: driver.vehicle,
          licensePlate: driver.licensePlate,
          isActive: driver.isActive,
          isAvailable: driver.isAvailable,
          avatarUrl: driver.avatarUrl,
          stats: {
            currentOrders,
            deliveriesToday,
            avgDeliveryTime: avgTime._avg.estimatedDeliveryTime || 0,
            totalDeliveries: driver._count.deliveryOrders,
          },
          currentLocation:
            driver.locations.length > 0
              ? {
                  lat: driver.locations[0].lat,
                  lng: driver.locations[0].lng,
                  updatedAt: driver.locations[0].timestamp,
                }
              : null,
          createdAt: driver.createdAt,
        };
      }),
    );

    return { drivers: driversWithStats };
  }

  /**
   * Crear un nuevo conductor
   */
  async createDriver(restaurantId: string, dto: CreateDeliveryDriverDto) {
    const driver = await this.prisma.deliveryDriver.create({
      data: {
        restaurantId,
        ...dto,
      },
    });

    return { success: true, driver, message: 'Repartidor creado exitosamente' };
  }

  /**
   * Actualizar un conductor
   */
  async updateDriver(
    restaurantId: string,
    driverId: string,
    dto: UpdateDeliveryDriverDto,
  ) {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: driverId, restaurantId },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    const updated = await this.prisma.deliveryDriver.update({
      where: { id: driverId },
      data: dto,
    });

    return { success: true, driver: updated };
  }

  /**
   * Eliminar un conductor
   */
  async deleteDriver(restaurantId: string, driverId: string) {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: driverId, restaurantId },
      include: {
        deliveryOrders: {
          where: {
            status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] },
          },
        },
      },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    if (driver.deliveryOrders.length > 0) {
      throw new BadRequestException(
        'No se puede eliminar un repartidor con pedidos activos',
      );
    }

    await this.prisma.deliveryDriver.delete({
      where: { id: driverId },
    });

    return { success: true, message: 'Repartidor eliminado' };
  }

  /**
   * Obtener estadísticas de un conductor
   */
  async getDriverStats(
    restaurantId: string,
    driverId: string,
    filters: DriverStatsFiltersDto,
  ) {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: driverId, restaurantId },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    const { startDate, endDate } = this.getDateRange(filters.period || 'today');

    const deliveries = await this.prisma.deliveryOrder.findMany({
      where: {
        driverId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: 'DELIVERED',
      },
    });

    const totalDeliveries = deliveries.length;
    const avgDeliveryTime =
      deliveries.reduce((sum, d) => sum + (d.estimatedDeliveryTime || 0), 0) /
        totalDeliveries || 0;
    const totalEarnings = deliveries.reduce((sum, d) => sum + d.deliveryFee, 0);

    // Deliveries por día
    const deliveriesByDay = this.groupByDay(deliveries);

    // Deliveries por hora
    const deliveriesByHour = this.groupByHour(deliveries);

    return {
      driver: {
        id: driver.id,
        name: driver.name,
      },
      stats: {
        totalDeliveries,
        avgDeliveryTime: Math.round(avgDeliveryTime),
        totalEarnings,
        deliveriesByDay,
        deliveriesByHour,
      },
    };
  }

  /**
   * Actualizar ubicación del conductor
   */
  async updateDriverLocation(
    restaurantId: string,
    driverId: string,
    dto: UpdateDriverLocationDto,
  ) {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: driverId, restaurantId },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    await this.prisma.driverLocation.create({
      data: {
        driverId,
        lat: dto.lat,
        lng: dto.lng,
        heading: dto.heading,
        speed: dto.speed,
      },
    });

    return { success: true, timestamp: new Date() };
  }

  /**
   * Obtener última ubicación del conductor
   */
  async getDriverLocation(restaurantId: string, driverId: string) {
    const driver = await this.prisma.deliveryDriver.findFirst({
      where: { id: driverId, restaurantId },
    });

    if (!driver) {
      throw new NotFoundException('Repartidor no encontrado');
    }

    const location = await this.prisma.driverLocation.findFirst({
      where: { driverId },
      orderBy: { timestamp: 'desc' },
    });

    if (!location) {
      throw new NotFoundException('No hay ubicación disponible');
    }

    return {
      location: {
        lat: location.lat,
        lng: location.lng,
        heading: location.heading,
        speed: location.speed,
        timestamp: location.timestamp,
      },
    };
  }

  // ============================================
  // HELPERS
  // ============================================

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
    const grouped: Record<string, number> = {};
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
    const grouped: Record<string, number> = {};
    deliveries.forEach((d) => {
      const hour = d.createdAt.getHours().toString();
      grouped[hour] = (grouped[hour] || 0) + 1;
    });
    return grouped;
  }
}
