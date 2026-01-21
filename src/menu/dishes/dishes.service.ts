import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDishDto, UpdateDishDto } from './dto/dish.dto';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  ImageProcessingService,
  ImageType,
} from '../../common/services/image-processing.service';

export interface DishFilters {
  categoryId?: string;
  available?: boolean;
  featured?: boolean;
  search?: string;
}

/**
 * Servicio para gestión de platos.
 * Refactorizado para usar servicios compartidos (DRY + SOLID).
 */
@Injectable()
export class DishesService {
  private readonly imageType: ImageType = 'dish';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  async findAllPublic(restaurantId: string, filters?: DishFilters) {
    const where: any = {
      restaurantId,
      deletedAt: null,
      isAvailable: true,
    };

    if (filters?.categoryId) where.categoryId = filters.categoryId;

    const dishes = await this.prisma.dish.findMany({
      where,
      include: {
        category: { select: { id: true, name: true } },
      },
      orderBy: [{ category: { order: 'asc' } }, { name: 'asc' }],
    });

    return {
      dishes: dishes.map((d) =>
        this.imageProcessing.transformImageFields(d, ['image']),
      ),
      total: dishes.length,
    };
  }

  async findAll(restaurantId: string, userId: string, filters?: DishFilters) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

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

    return {
      dishes: dishes.map((d) =>
        this.imageProcessing.transformImageFields(d, ['image']),
      ),
      total: dishes.length,
    };
  }

  async create(restaurantId: string, userId: string, dto: CreateDishDto) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

    const category = await this.prisma.category.findFirst({
      where: { id: dto.categoryId, restaurantId, deletedAt: null },
    });

    if (!category) {
      throw new BadRequestException(
        'Category not found or does not belong to this restaurant',
      );
    }

    const imagePath = await this.imageProcessing.processImage(
      dto.image,
      this.imageType,
    );

    const dish = await this.prisma.dish.create({
      data: {
        restaurantId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description,
        price: dto.price,
        image: imagePath,
        preparationTime: dto.preparationTime,
        isFeatured: dto.isFeatured ?? false,
        tags: dto.tags ?? [],
        allergens: dto.allergens ?? [],
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return {
      dish: this.imageProcessing.transformImageFields(dish, ['image']),
    };
  }

  async update(dishId: string, userId: string, dto: UpdateDishDto) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.ownership.verifyUserOwnsRestaurant(dish.restaurantId, userId);

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

    let imagePath: string | null | undefined;

    if (dto.image !== undefined) {
      if (dto.image === null || dto.image === '') {
        // Eliminar imagen existente
        await this.imageProcessing.deleteImage(dish.image);
        imagePath = null;
      } else if (dto.image === dish.image) {
        // La imagen no cambió, mantener la actual
        imagePath = undefined; // No actualizar el campo
      } else {
        // Procesar nueva imagen
        const isBase64 = /^data:image\//i.test(dto.image);
        if (dish.image && isBase64) {
          await this.imageProcessing.deleteImage(dish.image);
        }
        imagePath = await this.imageProcessing.processImage(
          dto.image,
          this.imageType,
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
        image: imagePath !== undefined ? imagePath : undefined,
        preparationTime: dto.preparationTime,
        isAvailable: dto.isAvailable,
        isFeatured: dto.isFeatured,
        tags: dto.tags,
        allergens: dto.allergens,
      },
      include: { category: { select: { id: true, name: true } } },
    });

    return {
      dish: this.imageProcessing.transformImageFields(updated, ['image']),
    };
  }

  async delete(dishId: string, userId: string) {
    const dish = await this.prisma.dish.findUnique({ where: { id: dishId } });

    if (!dish || dish.deletedAt) {
      throw new NotFoundException('Dish not found');
    }

    await this.ownership.verifyUserOwnsRestaurant(dish.restaurantId, userId);

    // Eliminar imagen si existe
    await this.imageProcessing.deleteImage(dish.image);

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

    await this.ownership.verifyUserOwnsRestaurant(dish.restaurantId, userId);

    const updated = await this.prisma.dish.update({
      where: { id: dishId },
      data: { isAvailable },
      select: { id: true, name: true, isAvailable: true },
    });

    return { dish: updated };
  }
}
