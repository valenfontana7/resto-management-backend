import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { ImageProcessingService } from '../common/services/image-processing.service';

@Injectable()
export class MenuAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
    private readonly imageProcessing: ImageProcessingService,
  ) {}

  async getAdminMenu(restaurantId: string, userId: string) {
    await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);

    const [categories, dishes] = await Promise.all([
      this.prisma.category.findMany({
        where: { restaurantId, deletedAt: null },
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
              dishes: { where: { deletedAt: null } },
            },
          },
        },
        orderBy: { order: 'asc' },
      }),
      this.prisma.dish.findMany({
        where: { restaurantId, deletedAt: null },
        include: {
          category: { select: { id: true, name: true } },
        },
        orderBy: [{ category: { order: 'asc' } }, { name: 'asc' }],
      }),
    ]);

    return {
      categories: categories.map((cat) => ({
        ...this.imageProcessing.transformImageFields(cat, ['image']),
        dishCount: cat._count.dishes,
        _count: undefined,
      })),
      dishes: dishes.map((dish) =>
        this.imageProcessing.transformImageFields(dish, ['image']),
      ),
      total: dishes.length,
    };
  }
}
