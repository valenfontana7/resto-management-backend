import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  UpdateDeliveryZonesDto,
  UpdatePaymentMethodsDto,
  BusinessHourDto,
} from '../dto/restaurant-settings.dto';

/**
 * Servicio para gestión de configuraciones de restaurante.
 * Incluye horarios, métodos de pago y zonas de delivery.
 * Extraído de RestaurantsService para cumplir con SRP (SOLID).
 */
@Injectable()
export class RestaurantSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Actualizar horarios del restaurante
   */
  async updateHours(id: string, hours: BusinessHourDto[]) {
    return this.prisma.$transaction(async () => {
      // Eliminar horarios existentes
      await this.prisma.businessHour.deleteMany({
        where: { restaurantId: id },
      });

      // Validar y preparar datos
      const groupedHours: Record<number, BusinessHourDto[]> = hours.reduce(
        (acc, h) => {
          if (!acc[h.dayOfWeek]) acc[h.dayOfWeek] = [];
          acc[h.dayOfWeek].push(h);
          return acc;
        },
        {} as Record<number, BusinessHourDto[]>,
      );

      const validHours: BusinessHourDto[] = [];

      for (const day in groupedHours) {
        const dayHours = groupedHours[day];
        const hasClosed = dayHours.some((h) => h.isOpen === false);
        const hasOpen = dayHours.some((h) => h.isOpen === true);

        if (hasClosed && hasOpen) {
          throw new BadRequestException(
            `Día ${day}: No se puede mezclar horarios abiertos y cerrados.`,
          );
        }

        if (hasClosed && dayHours.length > 1) {
          throw new BadRequestException(
            `Día ${day}: Solo se permite un registro cuando el día está cerrado.`,
          );
        }

        validHours.push(...dayHours);
      }

      // Crear registros válidos
      if (validHours.length > 0) {
        await this.prisma.businessHour.createMany({
          data: validHours.map((h) => ({
            restaurantId: id,
            dayOfWeek: h.dayOfWeek,
            openTime: h.openTime || '00:00',
            closeTime: h.closeTime || '00:00',
            isOpen: h.isOpen,
          })),
        });
      }

      // Retornar todos los días (0-6) con estructura apropiada
      const savedHours = await this.prisma.businessHour.findMany({
        where: { restaurantId: id },
      });

      // Crear estructura de semana completa (0-6), con arrays por día
      const allDays = Array.from({ length: 7 }, (_, dayOfWeek) => {
        const existingHours = savedHours.filter(
          (h) => h.dayOfWeek === dayOfWeek,
        );
        if (existingHours.length > 0) {
          return existingHours;
        }
        return [
          {
            dayOfWeek,
            isOpen: false,
            openTime: null,
            closeTime: null,
          },
        ];
      });

      return allDays;
    });
  }

  /**
   * Actualizar configuración de métodos de pago
   */
  async updatePaymentMethods(id: string, config: UpdatePaymentMethodsDto) {
    // Store as JSON in a dedicated field (requires migration)
    // For now, we'll use a simple approach with Restaurant fields
    const updateData: any = {};

    // We need to add paymentMethods field to Restaurant schema
    // This is a placeholder - requires migration
    await this.prisma.restaurant.update({
      where: { id },
      data: updateData,
      select: {
        updatedAt: true,
      },
    });

    return config.paymentMethods;
  }

  /**
   * Actualizar configuración de zonas de delivery
   */
  async updateDeliveryZones(id: string, config: UpdateDeliveryZonesDto) {
    const { deliveryZones, enableDelivery } = config;

    // Actualizar settings de delivery en features (campo JSON)
    const restaurant: any = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException(`Restaurant with ID ${id} not found`);
    }

    const currentFeatures = restaurant?.features || {};

    await this.prisma.restaurant.update({
      where: { id },
      data: {
        features: {
          ...currentFeatures,
          delivery: enableDelivery,
        },
      },
    });

    // Actualizar o crear zonas de delivery
    if (deliveryZones && deliveryZones.length > 0) {
      // Eliminar zonas existentes
      await this.prisma.deliveryZone.deleteMany({
        where: { restaurantId: id },
      });

      // Crear nuevas zonas
      await this.prisma.deliveryZone.createMany({
        data: deliveryZones.map((zone) => ({
          restaurantId: id,
          name: zone.name,
          deliveryFee: zone.deliveryFee || 0,
          minOrder: zone.minOrder || 0,
          estimatedTime: zone.estimatedTime || '',
          areas: zone.areas || [],
        })),
      });
    }

    return this.prisma.deliveryZone.findMany({
      where: { restaurantId: id },
    });
  }

  /**
   * Obtener zonas de delivery de un restaurante
   */
  async getDeliveryZones(restaurantId: string) {
    return this.prisma.deliveryZone.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Obtener horarios de un restaurante
   */
  async getHours(restaurantId: string) {
    const savedHours = await this.prisma.businessHour.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: 'asc' },
    });

    // Retornar estructura completa de semana (0-6)
    return Array.from({ length: 7 }, (_, dayOfWeek) => {
      const existingHour = savedHours.find((h) => h.dayOfWeek === dayOfWeek);
      if (existingHour) {
        return existingHour;
      }
      return {
        dayOfWeek,
        isOpen: false,
        openTime: null,
        closeTime: null,
      };
    });
  }

  /**
   * Registrar una visita al restaurante (analytics)
   */
  async logVisit(
    restaurantId: string,
    visitorData?: {
      ip?: string | null;
      userAgent?: string | null;
      referrer?: string | null;
    },
  ) {
    try {
      await this.prisma.analytics.create({
        data: {
          restaurantId,
          metric: 'page_view',
          value: 1,
          metadata: visitorData || {},
        },
      });
    } catch (e: any) {
      console.warn('Failed to log analytics:', e?.message || e);
    }
  }

  /**
   * Obtener conteo de visitas
   */
  async getVisitsCount(restaurantId: string, from?: Date, to?: Date) {
    const where: any = { restaurantId, metric: 'page_view' };

    if (from || to) {
      where.date = {};
      if (from) where.date.gte = from;
      if (to) where.date.lte = to;
    }

    return this.prisma.analytics.count({ where });
  }
}
