import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/inventory-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
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
        notes: dto.notes?.trim() || null,
      },
    });
    return { item };
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
        notes: dto.notes === undefined ? undefined : dto.notes?.trim() || null,
      },
    });
    return { item };
  }

  async remove(restaurantId: string, userId: string, itemId: string) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const existing = await this.prisma.inventoryItem.findFirst({
      where: { id: itemId, restaurantId },
    });
    if (!existing) throw new NotFoundException('Insumo no encontrado');
    await this.prisma.inventoryItem.delete({ where: { id: itemId } });
    return { success: true };
  }
}
