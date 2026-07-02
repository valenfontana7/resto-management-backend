import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { BusinessEventPublisherService } from '../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../business-events/types/event-type.enum';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/inventory-item.dto';
import { InventoryPdfService } from './inventory-pdf.service';
import { isAutoDeductOnSaleEnabled } from './inventory-consumption.utils';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly businessEvents: BusinessEventPublisherService,
    private readonly pdf: InventoryPdfService,
  ) {}

  async list(restaurantId: string, userId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const items = await this.prisma.inventoryItem.findMany({
      where: { restaurantId },
      orderBy: { name: 'asc' },
    });
    return { items };
  }

  async create(
    restaurantId: string,
    userId: string,
    dto: CreateInventoryItemDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const item = await this.prisma.inventoryItem.create({
      data: {
        restaurantId,
        name: dto.name.trim(),
        unit: dto.unit?.trim() || 'unidad',
        currentStock: dto.currentStock,
        minStock: dto.minStock,
        linkedDishIds: dto.linkedDishIds ?? [],
        autoDisableDishes: dto.autoDisableDishes ?? false,
        unitCost: dto.unitCost,
        notes: dto.notes?.trim() || null,
      },
    });
    const availability = await this.applyStockAvailability(restaurantId);
    return { item, availability };
  }

  async update(
    restaurantId: string,
    userId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, restaurantId },
    });
    if (!existing) throw new NotFoundException('Insumo no encontrado');

    const item = await this.prisma.inventoryItem.update({
      where: { id: itemId },
      data: {
        name: dto.name?.trim(),
        unit: dto.unit?.trim(),
        currentStock: dto.currentStock,
        minStock: dto.minStock,
        linkedDishIds: dto.linkedDishIds,
        autoDisableDishes: dto.autoDisableDishes,
        unitCost: dto.unitCost,
        notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
      },
    });
    const availability = await this.applyStockAvailability(restaurantId);
    return { item, availability };
  }

  async remove(restaurantId: string, userId: string, itemId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, restaurantId },
    });
    if (!existing) throw new NotFoundException('Insumo no encontrado');
    await this.prisma.inventoryItem.delete({ where: { id: itemId } });
    const availability = await this.applyStockAvailability(restaurantId);
    return { success: true, availability };
  }

  async exportPdf(restaurantId: string, userId: string): Promise<Buffer> {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

    const [restaurant, items] = await Promise.all([
      this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { name: true, businessRules: true },
      }),
      this.prisma.inventoryItem.findMany({
        where: { restaurantId },
        orderBy: { name: 'asc' },
      }),
    ]);

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    const linkedDishIds = [
      ...new Set(items.flatMap((item) => item.linkedDishIds)),
    ];
    const dishes =
      linkedDishIds.length > 0
        ? await this.prisma.dish.findMany({
            where: { restaurantId, id: { in: linkedDishIds }, deletedAt: null },
            select: { id: true, name: true },
          })
        : [];
    const dishNameById = new Map(dishes.map((dish) => [dish.id, dish.name]));

    const lowStockItems = items.filter(
      (item) => item.currentStock <= item.minStock,
    );
    const affectedDishes = lowStockItems.flatMap((item) =>
      item.linkedDishIds.map((dishId) => ({
        dishName: dishNameById.get(dishId) ?? 'Plato',
        inventoryItemName: item.name,
      })),
    );

    return this.pdf.generateReport({
      restaurantName: restaurant.name,
      autoDeductOnSale: isAutoDeductOnSaleEnabled(restaurant.businessRules),
      items: items.map((item) => ({
        name: item.name,
        unit: item.unit,
        currentStock: item.currentStock,
        minStock: item.minStock,
        unitCost: item.unitCost,
        autoDisableDishes: item.autoDisableDishes,
        linkedDishNames: item.linkedDishIds.map(
          (dishId) => dishNameById.get(dishId) ?? 'Plato',
        ),
      })),
      affectedDishes,
    });
  }

  /**
   * Sincroniza la disponibilidad de los platos según el stock de insumos
   * que tengan activado el autocorte (`autoDisableDishes`).
   *
   * Reglas:
   * - Un plato se marca NO disponible si algún insumo con autocorte que lo
   *   referencia está en stock 0 (o menos). Marca `autoDisabledByStock=true`.
   * - Un plato auto-deshabilitado se reactiva cuando ningún insumo con
   *   autocorte que lo referencia sigue en quiebre.
   * - NUNCA reactiva un plato deshabilitado manualmente
   *   (`autoDisabledByStock=false`).
   */
  async applyStockAvailability(restaurantId: string): Promise<{
    disabledDishIds: string[];
    reEnabledDishIds: string[];
  }> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { restaurantId, autoDisableDishes: true },
      select: { currentStock: true, linkedDishIds: true },
    });

    // Conjunto de platos que deben estar fuera por quiebre de stock.
    const dishesToDisable = new Set<string>();
    // Platos que están controlados por autocorte (no en quiebre ahora).
    const managedDishes = new Set<string>();

    for (const item of items) {
      const outOfStock = item.currentStock <= 0;
      for (const dishId of item.linkedDishIds) {
        managedDishes.add(dishId);
        if (outOfStock) dishesToDisable.add(dishId);
      }
    }

    const disabledDishIds: string[] = [];
    const reEnabledDishIds: string[] = [];

    // 1) Deshabilitar platos en quiebre que hoy están disponibles.
    if (dishesToDisable.size > 0) {
      const toDisable = await this.prisma.dish.findMany({
        where: {
          restaurantId,
          id: { in: [...dishesToDisable] },
          isAvailable: true,
          deletedAt: null,
        },
        select: { id: true, name: true },
      });
      if (toDisable.length > 0) {
        const ids = toDisable.map((d) => d.id);
        await this.prisma.dish.updateMany({
          where: { id: { in: ids } },
          data: { isAvailable: false, autoDisabledByStock: true },
        });
        disabledDishIds.push(...ids);
        this.publishOutOfStockEvents(restaurantId, toDisable);
      }
    }

    // 2) Reactivar platos que fueron auto-deshabilitados y ya no están en quiebre.
    const reEnableCandidates = [...managedDishes].filter(
      (dishId) => !dishesToDisable.has(dishId),
    );
    if (reEnableCandidates.length > 0) {
      const toReEnable = await this.prisma.dish.findMany({
        where: {
          restaurantId,
          id: { in: reEnableCandidates },
          autoDisabledByStock: true,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (toReEnable.length > 0) {
        const ids = toReEnable.map((d) => d.id);
        await this.prisma.dish.updateMany({
          where: { id: { in: ids } },
          data: { isAvailable: true, autoDisabledByStock: false },
        });
        reEnabledDishIds.push(...ids);
      }
    }

    return { disabledDishIds, reEnabledDishIds };
  }

  private publishOutOfStockEvents(
    restaurantId: string,
    dishes: Array<{ id: string; name: string }>,
  ): void {
    for (const dish of dishes) {
      void this.businessEvents
        .publish({
          eventType: BentooBusinessEventType.ProductOutOfStock,
          restaurantId,
          source: 'inventory.service',
          correlationId: dish.id,
          payload: {
            dishId: dish.id,
            dishName: dish.name,
          },
        })
        .catch(() => undefined);
    }
  }
}
