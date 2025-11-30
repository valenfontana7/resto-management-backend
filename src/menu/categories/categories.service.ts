import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  async findAll(restaurantId: string, userId: string) {
    // Verificar ownership
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const categories = await this.prisma.category.findMany({
      where: {
        restaurantId,
        deletedAt: null,
      },
      select: {
        id: true,
        name: true,
        description: true,
        image: true,
        isActive: true,
        order: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            dishes: {
              where: { deletedAt: null },
            },
          },
        },
      },
      orderBy: {
        order: 'asc',
      },
    });

    return {
      categories: categories.map((cat) => ({
        ...cat,
        dishCount: cat._count.dishes,
        _count: undefined,
      })),
    };
  }

  async create(restaurantId: string, userId: string, dto: CreateCategoryDto) {
    // Verificar ownership
    await this.verifyRestaurantOwnership(restaurantId, userId);

    // Verificar nombre único
    const existing = await this.prisma.category.findFirst({
      where: {
        restaurantId,
        name: dto.name,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Category with name "${dto.name}" already exists`,
      );
    }

    // Si no se provee order, obtener el siguiente disponible
    let order = dto.order;
    if (order === undefined) {
      const maxOrder = await this.prisma.category.findFirst({
        where: { restaurantId, deletedAt: null },
        orderBy: { order: 'desc' },
        select: { order: true },
      });
      order = (maxOrder?.order ?? -1) + 1;
    }

    const category = await this.prisma.category.create({
      data: {
        restaurantId,
        name: dto.name,
        description: dto.description,
        order,
        isActive: dto.isActive ?? true,
      },
    });

    return { category };
  }

  async update(categoryId: string, userId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { restaurant: true },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Category not found');
    }

    // Verificar ownership
    await this.verifyRestaurantOwnership(category.restaurantId, userId);

    // Si se cambia el nombre, verificar unicidad
    if (dto.name && dto.name !== category.name) {
      const existing = await this.prisma.category.findFirst({
        where: {
          restaurantId: category.restaurantId,
          name: dto.name,
          deletedAt: null,
          id: { not: categoryId },
        },
      });

      if (existing) {
        throw new ConflictException(
          `Category with name "${dto.name}" already exists`,
        );
      }
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        order: dto.order,
        isActive: dto.isActive,
      },
    });

    return { category: updated };
  }

  async delete(categoryId: string, userId: string) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: {
            dishes: {
              where: { deletedAt: null },
            },
          },
        },
      },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Category not found');
    }

    // Verificar ownership
    await this.verifyRestaurantOwnership(category.restaurantId, userId);

    // Verificar si tiene platos
    if (category._count.dishes > 0) {
      throw new ConflictException(
        'Cannot delete category with active dishes. Please delete or move the dishes first.',
      );
    }

    // Soft delete
    await this.prisma.category.update({
      where: { id: categoryId },
      data: { deletedAt: new Date() },
    });
  }

  async reorder(
    restaurantId: string,
    userId: string,
    categoryOrders: Array<{ id: string; order: number }>,
  ) {
    // Verificar ownership
    await this.verifyRestaurantOwnership(restaurantId, userId);

    // Actualizar en una transacción
    await this.prisma.$transaction(
      categoryOrders.map((item) =>
        this.prisma.category.update({
          where: { id: item.id, restaurantId },
          data: { order: item.order },
        }),
      ),
    );

    return {
      message: 'Categories reordered successfully',
      updated: categoryOrders.length,
    };
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        users: {
          where: { id: userId },
        },
      },
    });

    if (!restaurant || restaurant.users.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage this restaurant',
      );
    }
  }
}
