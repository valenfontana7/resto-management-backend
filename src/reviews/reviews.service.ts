import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, dto: CreateReviewDto) {
    const review = await this.prisma.review.create({
      data: {
        restaurantId,
        orderId: dto.orderId,
        dishId: dto.dishId,
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
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
}
