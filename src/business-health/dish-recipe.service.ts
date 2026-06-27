import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { UpsertDishRecipeDto } from './dto/dish-recipe.dto';
import { calculateRecipeCost } from './dish-recipe.utils';

@Injectable()
export class DishRecipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  async getRecipe(restaurantId: string, userId: string, dishId: string) {
    await this.verifyDish(restaurantId, userId, dishId);

    const lines = await this.prisma.dishRecipeLine.findMany({
      where: { dishId },
      include: {
        inventoryItem: {
          select: {
            id: true,
            name: true,
            unit: true,
            unitCost: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const computedCost = calculateRecipeCost(
      lines.map((line) => ({
        quantity: line.quantity,
        unitCost: line.inventoryItem.unitCost,
      })),
    );

    const dish = await this.prisma.dish.findUnique({
      where: { id: dishId },
      select: { costPrice: true, price: true, name: true },
    });

    return {
      dishId,
      dishName: dish?.name ?? '',
      salePrice: dish?.price ?? 0,
      costPrice: dish?.costPrice ?? null,
      computedCost,
      lines: lines.map((line) => ({
        id: line.id,
        inventoryItemId: line.inventoryItemId,
        name: line.inventoryItem.name,
        unit: line.inventoryItem.unit,
        unitCost: line.inventoryItem.unitCost,
        quantity: line.quantity,
        lineCost:
          line.inventoryItem.unitCost != null
            ? Math.round(line.quantity * line.inventoryItem.unitCost)
            : null,
      })),
    };
  }

  async upsertRecipe(
    restaurantId: string,
    userId: string,
    dishId: string,
    dto: UpsertDishRecipeDto,
  ) {
    await this.verifyDish(restaurantId, userId, dishId);

    const itemIds = dto.lines.map((line) => line.inventoryItemId);
    if (itemIds.length > 0) {
      const items = await this.prisma.inventoryItem.findMany({
        where: { restaurantId, id: { in: itemIds } },
        select: { id: true },
      });
      if (items.length !== new Set(itemIds).size) {
        throw new BadRequestException(
          'Uno o más insumos no pertenecen al restaurante',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.dishRecipeLine.deleteMany({ where: { dishId } });
      if (dto.lines.length > 0) {
        await tx.dishRecipeLine.createMany({
          data: dto.lines.map((line) => ({
            dishId,
            inventoryItemId: line.inventoryItemId,
            quantity: line.quantity,
          })),
        });
      }

      if (dto.syncCostToDish !== false) {
        const withItems = await tx.dishRecipeLine.findMany({
          where: { dishId },
          include: {
            inventoryItem: { select: { unitCost: true } },
          },
        });
        const computed = calculateRecipeCost(
          withItems.map((line) => ({
            quantity: line.quantity,
            unitCost: line.inventoryItem.unitCost,
          })),
        );
        if (computed != null) {
          await tx.dish.update({
            where: { id: dishId },
            data: { costPrice: computed },
          });
        }
      }
    });

    return this.getRecipe(restaurantId, userId, dishId);
  }

  async syncCostFromRecipe(
    restaurantId: string,
    userId: string,
    dishId: string,
  ) {
    const recipe = await this.getRecipe(restaurantId, userId, dishId);
    if (recipe.computedCost == null) {
      throw new BadRequestException(
        'Completá costo unitario en todos los insumos de la receta',
      );
    }

    await this.prisma.dish.update({
      where: { id: dishId },
      data: { costPrice: recipe.computedCost },
    });

    return {
      dishId,
      costPrice: recipe.computedCost,
    };
  }

  private async verifyDish(
    restaurantId: string,
    userId: string,
    dishId: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);
    const dish = await this.prisma.dish.findFirst({
      where: { id: dishId, restaurantId, deletedAt: null },
      select: { id: true },
    });
    if (!dish) throw new NotFoundException('Plato no encontrado');
  }
}
