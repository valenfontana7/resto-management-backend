import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDishDto, UpdateDishDto } from './dto/dish.dto';

export interface DishFilters {
  categoryId?: string;
  available?: boolean;
  featured?: boolean;
  search?: string;
}

@Injectable()
export class DishesService {
  constructor(private prisma: PrismaService) {}

  async findAll(restaurantId: string, userId: string, filters?: DishFilters) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const where: any = {
      restaurantId,
      deletedAt: null,
    };

    if (filters?.categoryId) where.categoryId = filters.categoryId;
    if (filters?.available !== undefined) where.isAvailable = filters.available;
    if (filters?.featured !== undefined) where.isFeatured = filters.featured;
    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const dishes = await this.prisma.dish.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { order: 'asc' } }, { name: 'asc' }],
    });

    return { dishes, total: dishes.length };
  }

  async create(restaurantId: string, userId: string, dto: CreateDishDto) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, restaurantId, deletedAt: null },
    });

    if (!category) {
      throw new BadRequestException(
        'Category not found or does not belong to this restaurant',
      );
    }

    const dish = await this.prisma.dish.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        preparationTime: dto.preparationTime,
        isFeatured: dto.isFeatured ?? false,
        tags: dto.tags ?? [],
        allergens: dto.allergens ?? [],
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return { dish };
  }

  async update(dishId: string, userId: string, dto: UpdateDishDto) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.verifyRestaurantOwnership(dish.restaurantId, userId);

    if (dto.categoryId && dto.categoryId !== dish.categoryId) {
      const category = await this.prisma.category.findFirst({
        where: {
          id: dto.categoryId,
          restaurantId: dish.restaurantId,
          deletedAt: null,
        },
      });

      if (!category) {
        throw new BadRequestException(
          'Category not found or does not belong to this restaurant',
        );
      }
    }

    const updated = await this.prisma.dish.update({
      where: { id: dishId },
      data: {
        name: dto.name,
        description: dto.description,
        price: dto.price,
        categoryId: dto.categoryId,
        preparationTime: dto.preparationTime,
        isAvailable: dto.isAvailable,
        isFeatured: dto.isFeatured,
        tags: dto.tags,
        allergens: dto.allergens,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return { dish: updated };
  }

  async delete(dishId: string, userId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.verifyRestaurantOwnership(dish.restaurantId, userId);

    await this.prisma.dish.update({
      where: { id: dishId },
      data: { deletedAt: new Date() },
    });
  }

  async toggleAvailability(
    dishId: string,
    userId: string,
    isAvailable: boolean,
  ) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.verifyRestaurantOwnership(dish.restaurantId, userId);

    const updated = await this.prisma.dish.update({
      where: { id: dishId },
      data: { isAvailable },
      select: { id: true, name: true, isAvailable: true },
    });

    return { dish: updated };
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { users: { where: { id: userId } } },
    });

    if (!restaurant || restaurant.users.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage this restaurant',
      );
    }
  }
}
