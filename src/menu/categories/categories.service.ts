import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { OwnershipService } from '../../common/services/ownership.service';
import {
  ImageProcessingService,
  ImageType,
} from '../../common/services/image-processing.service';

/**
 * Servicio para gestión de categorías.
 * Refactorizado para usar servicios compartidos (DRY + SOLID).
 */
@Injectable()
export class CategoriesService {
  private readonly imageType: ImageType = 'category';

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  async findAll(restaurantId: string, userId: string) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

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
        ...this.imageProcessing.transformImageFields(cat, ['image']),
        dishCount: cat._count.dishes,
        _count: undefined,
      })),
    };
  }

  async create(restaurantId: string, userId: string, dto: CreateCategoryDto) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

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

    const imagePath = await this.imageProcessing.processImage(
      dto.image,
      this.imageType,
    );

    const category = await this.prisma.category.create({
      data: {
        restaurantId,
        name: dto.name,
        description: dto.description,
        image: imagePath,
        order,
        isActive: dto.isActive ?? true,
      },
    });

    return {
      category: this.imageProcessing.transformImageFields(category, ['image']),
    };
  }

  async update(categoryId: string, userId: string, dto: UpdateCategoryDto) {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      include: { restaurant: true },
    });

    if (!category || category.deletedAt) {
      throw new NotFoundException('Category not found');
    }

    await this.ownership.verifyUserOwnsRestaurant(
      category.restaurantId,
      userId,
    );

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

    let imagePath: string | null | undefined;
    if (dto.image) {
      // Si la imagen no cambió, no la reprocesar
      if (dto.image === category.image) {
        imagePath = undefined; // Mantener la imagen existente
      } else {
        // Eliminar imagen anterior si existe
        await this.imageProcessing.deleteImage(category.image);
        imagePath = await this.imageProcessing.processImage(
          dto.image,
          this.imageType,
        );
      }
    }

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        name: dto.name,
        description: dto.description,
        image: imagePath !== undefined ? imagePath : undefined,
        order: dto.order,
        isActive: dto.isActive,
      },
    });

    return {
      category: this.imageProcessing.transformImageFields(updated, ['image']),
    };
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

    await this.ownership.verifyUserOwnsRestaurant(
      category.restaurantId,
      userId,
    );

    // Verificar si tiene platos
    if (category._count.dishes > 0) {
      throw new ConflictException(
        'Cannot delete category with active dishes. Please delete or move the dishes first.',
      );
    }

    // Eliminar imagen si existe
    await this.imageProcessing.deleteImage(category.image);

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
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

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
}
