import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, dto: CreateReviewDto) {
    await this.assertReviewTargetIsValid(restaurantId, dto);

    if (dto.orderId) {
      const duplicateWhere: any = {
        restaurantId,
        orderId: dto.orderId,
        dishId: dto.dishId ?? null,
      };
      const existingReview = await this.prisma.review.findFirst({
        where: duplicateWhere,
        select: { id: true },
      });

      if (existingReview) {
        throw new ConflictException('Ya recibimos una reseña para este pedido');
      }
    }

    const review = await this.prisma.review.create({
      data: {
        restaurantId,
        orderId: dto.orderId,
        dishId: dto.dishId,
        customerName: dto.customerName,
        customerEmail: this.normalizeEmail(dto.customerEmail),
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    // If dish-level review, update dish avg rating
    if (dto.dishId) {
      await this.updateDishRating(dto.dishId);
    }

    return review;
  }

  async findByRestaurant(
    restaurantId: string,
    opts: { approved?: boolean; page?: number; limit?: number },
  ) {
    const { approved, page = 1, limit = 20 } = opts;
    const where: any = { restaurantId };
    if (approved !== undefined) where.isApproved = approved;

    const [reviews, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { dish: { select: { id: true, name: true, image: true } } },
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByDish(dishId: string, page = 1, limit = 10) {
    const where = { dishId, isApproved: true };

    const [reviews, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.review.count({ where }),
    ]);

    return {
      reviews,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approve(reviewId: string, restaurantId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, restaurantId },
    });
    if (!review) throw new NotFoundException('Review no encontrada');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { isApproved: true },
    });

    if (updated.dishId) {
      await this.updateDishRating(updated.dishId);
    }

    return updated;
  }

  async reject(reviewId: string, restaurantId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, restaurantId },
    });
    if (!review) throw new NotFoundException('Review no encontrada');

    const updated = await this.prisma.review.update({
      where: { id: reviewId },
      data: { isApproved: false },
    });

    if (updated.dishId) {
      await this.updateDishRating(updated.dishId);
    }

    return updated;
  }

  async delete(reviewId: string, restaurantId: string) {
    const review = await this.prisma.review.findFirst({
      where: { id: reviewId, restaurantId },
    });
    if (!review) throw new NotFoundException('Review no encontrada');

    await this.prisma.review.delete({ where: { id: reviewId } });

    if (review.dishId) {
      await this.updateDishRating(review.dishId);
    }

    return { deleted: true };
  }

  async getRestaurantStats(restaurantId: string) {
    const result = await this.prisma.review.aggregate({
      where: { restaurantId, isApproved: true },
      _avg: { rating: true },
      _count: { id: true },
    });

    return {
      avgRating: result._avg.rating ?? 0,
      totalReviews: result._count.id,
    };
  }

  private async updateDishRating(dishId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { dishId, isApproved: true },
      _avg: { rating: true },
      _count: { id: true },
    });

    await this.prisma.dish.update({
      where: { id: dishId },
      data: {
        avgRating: agg._avg.rating ?? 0,
        reviewCount: agg._count.id,
      },
    });
  }

  private async assertReviewTargetIsValid(
    restaurantId: string,
    dto: CreateReviewDto,
  ) {
    if (dto.dishId) {
      const dish = await this.prisma.dish.findFirst({
        where: { id: dto.dishId, restaurantId },
        select: { id: true },
      });

      if (!dish) {
        throw new BadRequestException('El plato no pertenece al restaurante');
      }
    }

    if (!dto.orderId) return;

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, restaurantId },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new BadRequestException('El pedido no pertenece al restaurante');
    }

    if (String(order.status) !== 'DELIVERED') {
      throw new BadRequestException(
        'Solo se pueden reseñar pedidos entregados',
      );
    }

    if (!dto.dishId) return;

    const orderItem = await this.prisma.orderItem.findFirst({
      where: { orderId: dto.orderId, dishId: dto.dishId },
      select: { id: true },
    });

    if (!orderItem) {
      throw new BadRequestException('El plato no pertenece al pedido');
    }
  }

  private normalizeEmail(email?: string) {
    return email?.trim().toLowerCase();
  }
}
