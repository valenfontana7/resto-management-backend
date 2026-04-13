import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import {
  UpdateRestaurantStatusDto,
  RestaurantStatusAction,
} from '../dto/update-restaurant-status.dto';
import { UpdateRestaurantDto } from '../dto/update-restaurant.dto';
import { CreateRestaurantDto } from '../dto/create-restaurant.dto';
import { RestaurantStatus } from '@prisma/client';

@Injectable()
export class SuperAdminRestaurantsService {
  private readonly logger = new Logger(SuperAdminRestaurantsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  async getRestaurants(
    page: number = 1,
    limit: number = 10,
    search?: string,
    status?: string,
    plan?: string,
    cuisine?: string,
    include?: string,
  ) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (status) {
      where.status = status.toUpperCase();
    }
    if (plan) {
      where.subscription = { planType: plan };
    }
    if (cuisine) {
      where.cuisineTypes = { has: cuisine };
    }

    const includeOptions = include
      ? include.split(',').map((s) => s.trim())
      : [];
    const includeContact = includeOptions.includes('contact');
    const includeBranding = includeOptions.includes('branding');
    const includeBusinessInfo = includeOptions.includes('businessInfo');

    const [total, data] = await Promise.all([
      this.prisma.restaurant.count({ where }),
      this.prisma.restaurant.findMany({
        where,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          onboardingIncomplete: true,
          isPublished: true,
          createdAt: true,
          subscription: {
            select: {
              planType: true,
              status: true,
            },
          },
          verificationStatus: true,
          ...(includeContact && {
            email: true,
            phone: true,
            address: true,
            city: true,
            country: true,
            postalCode: true,
          }),
          ...(includeBranding && {
            branding: true,
          }),
          ...(includeBusinessInfo && {
            type: true,
            cuisineTypes: true,
            description: true,
          }),
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const transformedData = data.map((restaurant) => {
      const result: any = {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
        onboardingIncomplete: restaurant.onboardingIncomplete,
        isPublished: restaurant.isPublished,
        createdAt: restaurant.createdAt,
        subscription: restaurant.subscription,
        verificationStatus: restaurant.verificationStatus,
      };

      if (includeContact) {
        result.contact = {
          email: restaurant.email,
          phone: restaurant.phone,
          address: restaurant.address,
          city: restaurant.city,
          country: restaurant.country,
          postalCode: restaurant.postalCode,
        };
      }

      if (includeBranding) {
        result.branding = restaurant.branding;
      }

      if (includeBusinessInfo) {
        result.businessInfo = {
          type: restaurant.type,
          cuisineTypes: restaurant.cuisineTypes,
          description: restaurant.description,
        };
      }

      return result;
    });

    return {
      data: transformedData,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getRestaurantDetails(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      include: {
        subscription: true,
        users: {
          where: { role: { name: 'OWNER' } },
          take: 1,
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: {
            orders: true,
            dishes: true,
          },
        },
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);

    const revenue = await this.prisma.order.aggregate({
      where: {
        restaurantId: id,
        status: { in: ['DELIVERED', 'READY'] },
        createdAt: { gte: currentMonthStart },
      },
      _sum: {
        total: true,
      },
    });

    return {
      ...restaurant,
      metrics: {
        revenueCurrentMonth: revenue._sum.total || 0,
        totalOrders: restaurant._count.orders,
        totalDishes: restaurant._count.dishes,
      },
    };
  }

  async updateRestaurant(
    id: string,
    dto: UpdateRestaurantDto,
    adminId: string,
  ) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    const updateData: any = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;

    if (dto.businessInfo) {
      if (dto.businessInfo.type !== undefined)
        updateData.type = dto.businessInfo.type;
      if (dto.businessInfo.cuisineTypes !== undefined)
        updateData.cuisineTypes = dto.businessInfo.cuisineTypes;
      if (dto.businessInfo.description !== undefined)
        updateData.description = dto.businessInfo.description;
    }

    if (dto.contact) {
      if (dto.contact.phone !== undefined) updateData.phone = dto.contact.phone;
      if (dto.contact.address !== undefined)
        updateData.address = dto.contact.address;
      if (dto.contact.city !== undefined) updateData.city = dto.contact.city;
      if (dto.contact.country !== undefined)
        updateData.country = dto.contact.country;
      if (dto.contact.postalCode !== undefined)
        updateData.postalCode = dto.contact.postalCode;
    }

    if (dto.branding !== undefined) updateData.branding = dto.branding;
    if (dto.isPublished !== undefined) updateData.isPublished = dto.isPublished;

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: updateData,
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'UPDATE_RESTAURANT',
        targetRestaurantId: id,
        details: {
          changes: updateData,
          previousValues: {
            name: restaurant.name,
            email: restaurant.email,
            type: restaurant.type,
            cuisineTypes: restaurant.cuisineTypes,
            description: restaurant.description,
            phone: restaurant.phone,
            address: restaurant.address,
            city: restaurant.city,
            country: restaurant.country,
            postalCode: restaurant.postalCode,
          },
        },
      },
    });

    return updated;
  }

  async updateRestaurantStatus(
    id: string,
    dto: UpdateRestaurantStatusDto,
    adminId: string,
  ) {
    let newStatus: RestaurantStatus;
    switch (dto.status) {
      case RestaurantStatusAction.ACTIVE:
        newStatus = 'ACTIVE';
        break;
      case RestaurantStatusAction.SUSPENDED:
        newStatus = 'SUSPENDED';
        break;
      case RestaurantStatusAction.BANNED:
        newStatus = 'INACTIVE';
        break;
      default:
        newStatus = 'ACTIVE';
    }

    const previous = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!previous) throw new NotFoundException('Restaurant not found');

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: { status: newStatus },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CHANGE_STATUS',
        targetRestaurantId: id,
        details: {
          oldStatus: previous.status,
          newStatus,
          reason: dto.reason,
        },
      },
    });

    return updated;
  }

  async deleteRestaurant(id: string, adminId: string) {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!restaurant) throw new NotFoundException('Restaurant not found');

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'DELETE_RESTAURANT',
        targetRestaurantId: id,
        details: {
          oldStatus: restaurant.status,
          newStatus: 'INACTIVE',
        },
      },
    });

    return updated;
  }

  async createRestaurant(dto: CreateRestaurantDto) {
    const baseSlug = dto.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;
    while (await this.prisma.restaurant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.name,
          slug,
          email: dto.email,
          phone: dto.contact?.phone || '',
          address: dto.contact?.address || '',
          city: dto.contact?.city || '',
          country: dto.contact?.country || '',
          postalCode: dto.contact?.postalCode || '',
          type: dto.businessInfo?.type || 'restaurant',
          cuisineTypes: dto.businessInfo?.cuisineTypes || [],
          description: dto.businessInfo?.description || '',
          branding: dto.branding || {},
          status: 'PENDING',
          verificationStatus: 'UNVERIFIED',
          onboardingIncomplete: true,
        },
      });

      let ownerRole = await tx.role.findFirst({
        where: { restaurantId: restaurant.id, name: 'OWNER' },
      });

      if (!ownerRole) {
        ownerRole = await tx.role.create({
          data: {
            restaurantId: restaurant.id,
            name: 'OWNER',
            permissions: ['all'],
            color: '#ef4444',
            isSystemRole: true,
          },
        });
      }

      const adminEmail = dto.adminEmail || dto.email;

      const existingUser = await tx.user.findFirst({
        where: { email: adminEmail, restaurantId: restaurant.id },
      });

      if (existingUser) {
        throw new BadRequestException(
          'Ya existe un administrador con este email para este restaurante',
        );
      }

      const adminUser = await tx.user.create({
        data: {
          email: adminEmail,
          password: '',
          name: `Admin ${dto.name}`,
          restaurantId: restaurant.id,
          roleId: ownerRole.id,
          isActive: true,
        },
      });

      return { restaurant, adminUser };
    });

    return {
      data: {
        id: result.restaurant.id,
        name: result.restaurant.name,
        slug: result.restaurant.slug,
        email: result.restaurant.email,
        status: result.restaurant.status,
        createdAt: result.restaurant.createdAt,
        businessInfo: {
          type: result.restaurant.type,
          cuisineTypes: result.restaurant.cuisineTypes,
          description: result.restaurant.description,
        },
        contact: {
          phone: result.restaurant.phone,
          address: result.restaurant.address,
          city: result.restaurant.city,
          country: result.restaurant.country,
          postalCode: result.restaurant.postalCode,
        },
        branding: result.restaurant.branding,
      },
      meta: {
        message: 'Restaurante creado exitosamente',
        adminUserId: result.adminUser.id,
        adminEmail: result.adminUser.email,
      },
    };
  }

  async impersonate(restaurantId: string, adminId: string) {
    const targetUser = await this.prisma.user.findFirst({
      where: { restaurantId },
      include: { role: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!targetUser) {
      throw new NotFoundException('No users found for this restaurant');
    }

    const authResponse =
      await this.authService.generateAuthResponse(targetUser);

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'IMPERSONATE',
        targetRestaurantId: restaurantId,
        details: { impersonatedUser: targetUser.email },
      },
    });

    return {
      token: authResponse.token,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role?.name,
      },
    };
  }

  async getGlobalStats() {
    const totalRestaurants = await this.prisma.restaurant.count();
    const totalUsers = await this.prisma.user.count();
    const activeRestaurants = await this.prisma.restaurant.count({
      where: { status: 'ACTIVE' },
    });

    const startOfCurrentMonth = new Date();
    startOfCurrentMonth.setDate(1);
    startOfCurrentMonth.setHours(0, 0, 0, 0);

    const revenueCurrent = await this.prisma.order.aggregate({
      where: {
        createdAt: { gte: startOfCurrentMonth },
        status: { in: ['PAID', 'DELIVERED', 'READY'] as any },
      },
      _sum: { total: true },
    });

    return {
      totalRestaurants,
      activeRestaurants,
      totalRevenue: revenueCurrent._sum.total || 0,
      totalUsers,
    };
  }
}
