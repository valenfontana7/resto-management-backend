import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateDeliveryZoneDto,
  UpdateDeliveryZoneDto,
} from '../dto/delivery.dto';

/**
 * Servicio para gestión de zonas de delivery.
 * Extraído de DeliveryService para cumplir con SRP (SOLID).
 */
@Injectable()
export class DeliveryZonesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtener todas las zonas de delivery con estadísticas
   */
  async getZones(restaurantId: string) {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { restaurantId },
      include: {
        _count: {
          select: { deliveryOrders: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    // Calcular estadísticas básicas
    const zonesWithStats = await Promise.all(
      zones.map(async (zone) => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const ordersToday = await this.prisma.deliveryOrder.count({
          where: {
            zoneId: zone.id,
            createdAt: { gte: today },
          },
        });

        const avgDeliveryTime = await this.prisma.deliveryOrder.aggregate({
          where: {
            zoneId: zone.id,
            status: 'DELIVERED',
            deliveredAt: { not: null },
            assignedAt: { not: null },
          },
          _avg: {
            estimatedDeliveryTime: true,
          },
        });

        return {
          ...zone,
          stats: {
            ordersToday,
            avgDeliveryTime: avgDeliveryTime._avg.estimatedDeliveryTime || 0,
          },
        };
      }),
    );

    return { zones: zonesWithStats };
  }

  /**
   * Crear una nueva zona de delivery
   */
  async createZone(restaurantId: string, dto: CreateDeliveryZoneDto) {
    // Verificar que no existe otra zona con el mismo nombre
    const existing = await this.prisma.deliveryZone.findUnique({
      where: {
        restaurantId_name: {
          restaurantId,
          name: dto.name,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Ya existe una zona con el nombre "${dto.name}"`,
      );
    }

    const zone = await this.prisma.deliveryZone.create({
      data: {
        restaurantId,
        ...dto,
      },
    });

    return { success: true, zone, message: 'Zona creada exitosamente' };
  }

  /**
   * Actualizar una zona de delivery
   */
  async updateZone(
    restaurantId: string,
    zoneId: string,
    dto: UpdateDeliveryZoneDto,
  ) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id: zoneId, restaurantId },
    });

    if (!zone) {
      throw new NotFoundException('Zona no encontrada');
    }

    // Si se cambia el nombre, verificar unicidad
    if (dto.name && dto.name !== zone.name) {
      const existing = await this.prisma.deliveryZone.findUnique({
        where: {
          restaurantId_name: {
            restaurantId,
            name: dto.name,
          },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Ya existe una zona con el nombre "${dto.name}"`,
        );
      }
    }

    const updated = await this.prisma.deliveryZone.update({
      where: { id: zoneId },
      data: dto,
    });

    return { success: true, zone: updated };
  }

  /**
   * Eliminar una zona de delivery
   */
  async deleteZone(restaurantId: string, zoneId: string) {
    const zone = await this.prisma.deliveryZone.findFirst({
      where: { id: zoneId, restaurantId },
    });

    if (!zone) {
      throw new NotFoundException('Zona no encontrada');
    }

    await this.prisma.deliveryZone.delete({
      where: { id: zoneId },
    });

    return { success: true, message: 'Zona eliminada' };
  }
}
