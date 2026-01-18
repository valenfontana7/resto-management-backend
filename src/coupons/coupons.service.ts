import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCouponDto,
  UpdateCouponDto,
  CouponFiltersDto,
  ValidateCouponDto,
  CouponType,
} from './dto/coupon.dto';

@Injectable()
export class CouponsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(restaurantId: string, createDto: CreateCouponDto) {
    // Validate dates
    const validFrom = new Date(createDto.validFrom);
    const validUntil = new Date(createDto.validUntil);

    if (validFrom >= validUntil) {
      throw new BadRequestException('validFrom must be before validUntil');
    }

    // Check if code already exists for this restaurant
    const existingCoupon = await this.prisma.coupon.findFirst({
      where: {
        restaurantId,
        code: createDto.code,
      },
    });

    if (existingCoupon) {
      throw new ConflictException(
        'Coupon code already exists for this restaurant',
      );
    }

    const coupon = await this.prisma.coupon.create({
      data: {
        restaurantId,
        ...createDto,
        validFrom,
        validUntil,
      },
    });

    return { coupon };
  }

  async findAll(restaurantId: string, filters: CouponFiltersDto = {}) {
    const where: any = { restaurantId };

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.code) {
      where.code = {
        contains: filters.code,
        mode: 'insensitive',
      };
    }

    const [coupons, count] = await Promise.all([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.coupon.count({ where }),
    ]);

    return { coupons, count };
  }

  async findOne(id: string, restaurantId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${id} not found`);
    }

    return { coupon };
  }

  async update(id: string, restaurantId: string, updateDto: UpdateCouponDto) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${id} not found`);
    }

    // Validate dates if provided
    if (updateDto.validFrom && updateDto.validUntil) {
      const validFrom = new Date(updateDto.validFrom);
      const validUntil = new Date(updateDto.validUntil);

      if (validFrom >= validUntil) {
        throw new BadRequestException('validFrom must be before validUntil');
      }
    }

    // Check code uniqueness if changing code
    if (updateDto.code && updateDto.code !== coupon.code) {
      const existingCoupon = await this.prisma.coupon.findFirst({
        where: {
          restaurantId,
          code: updateDto.code,
        },
      });

      if (existingCoupon) {
        throw new ConflictException(
          'Coupon code already exists for this restaurant',
        );
      }
    }

    const updatedCoupon = await this.prisma.coupon.update({
      where: { id },
      data: {
        ...updateDto,
        validFrom: updateDto.validFrom
          ? new Date(updateDto.validFrom)
          : undefined,
        validUntil: updateDto.validUntil
          ? new Date(updateDto.validUntil)
          : undefined,
      },
    });

    return { coupon: updatedCoupon };
  }

  async delete(id: string, restaurantId: string) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!coupon) {
      throw new NotFoundException(`Coupon with ID ${id} not found`);
    }

    await this.prisma.coupon.delete({
      where: { id },
    });

    return { success: true };
  }

  async validate(restaurantId: string, validateDto: ValidateCouponDto) {
    const coupon = await this.prisma.coupon.findFirst({
      where: {
        restaurantId,
        code: validateDto.code,
        isActive: true,
      },
    });

    if (!coupon) {
      return {
        valid: false,
        discountAmount: 0,
        message: 'Cupón no encontrado o inactivo',
      };
    }

    // Check date validity
    const now = new Date();
    if (now < coupon.validFrom || now > coupon.validUntil) {
      return {
        valid: false,
        discountAmount: 0,
        message: 'Cupón expirado',
      };
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return {
        valid: false,
        discountAmount: 0,
        message: 'Límite de uso alcanzado',
      };
    }

    // Check minimum order amount
    if (
      coupon.minOrderAmount &&
      validateDto.orderAmount < coupon.minOrderAmount.toNumber()
    ) {
      return {
        valid: false,
        discountAmount: 0,
        message: `Monto mínimo de pedido: $${coupon.minOrderAmount.toNumber()}`,
      };
    }

    // Check applicable products/categories if specified
    if (
      validateDto.items &&
      (coupon.applicableProducts?.length || coupon.applicableCategories?.length)
    ) {
      const hasApplicableItems = validateDto.items.some((item) => {
        const productApplicable =
          !coupon.applicableProducts?.length ||
          coupon.applicableProducts.includes(item.productId);

        const categoryApplicable =
          !coupon.applicableCategories?.length ||
          (item.categoryId &&
            coupon.applicableCategories.includes(item.categoryId));

        return productApplicable && categoryApplicable;
      });

      if (!hasApplicableItems) {
        return {
          valid: false,
          discountAmount: 0,
          message: 'Cupón no aplicable a los productos seleccionados',
        };
      }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discountAmount =
        (validateDto.orderAmount * coupon.value.toNumber()) / 100;
      if (
        coupon.maxDiscountAmount &&
        discountAmount > coupon.maxDiscountAmount.toNumber()
      ) {
        discountAmount = coupon.maxDiscountAmount.toNumber();
      }
    } else {
      discountAmount = Math.min(
        coupon.value.toNumber(),
        validateDto.orderAmount,
      );
    }

    return {
      valid: true,
      coupon,
      discountAmount,
      message: 'Cupón válido',
    };
  }

  async getStats(
    restaurantId: string,
    period: 'day' | 'week' | 'month' | 'year' = 'month',
  ) {
    const now = new Date();
    let startDate: Date;

    switch (period) {
      case 'day':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        startDate = weekStart;
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
    }

    const [totalCoupons, activeCoupons, usageStats] = await Promise.all([
      this.prisma.coupon.count({
        where: { restaurantId },
      }),
      this.prisma.coupon.count({
        where: {
          restaurantId,
          isActive: true,
          validUntil: { gte: now },
        },
      }),
      this.prisma.couponUsage.aggregate({
        where: {
          coupon: { restaurantId },
          usedAt: { gte: startDate },
        },
        _count: { id: true },
        _sum: { discountAmount: true },
      }),
    ]);

    const totalUsage = usageStats._count.id || 0;
    const totalDiscount = usageStats._sum.discountAmount?.toNumber() || 0;
    const averageDiscount = totalUsage > 0 ? totalDiscount / totalUsage : 0;

    return {
      totalCoupons,
      activeCoupons,
      totalUsage,
      totalDiscount,
      averageDiscount,
    };
  }

  async incrementUsage(couponId: string) {
    await this.prisma.coupon.update({
      where: { id: couponId },
      data: {
        usageCount: { increment: 1 },
      },
    });
  }
}
