import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  UpdateRestaurantStatusDto,
  RestaurantStatusAction,
} from './dto/update-restaurant-status.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { CreateRestaurantDto } from './dto/create-restaurant.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AuthService } from '../auth/auth.service';
import { PlanType, RestaurantStatus } from '@prisma/client';
import { KitchenNotificationsService } from '../kitchen/kitchen-notifications.service';
import * as crypto from 'crypto';

@Injectable()
export class SuperAdminService {
  constructor(
    private prisma: PrismaService,
    private authService: AuthService,
    private kitchenNotifications: KitchenNotificationsService,
  ) {
    void this.ensureSuperAdminRole();
  }

  private async ensureSuperAdminRole() {
    try {
      const superAdminRole = await this.prisma.role.findFirst({
        where: {
          name: 'SUPER_ADMIN',
          restaurantId: null,
        },
      });

      if (!superAdminRole) {
        await this.prisma.role.create({
          data: {
            name: 'SUPER_ADMIN',
            permissions: ['all', 'super_admin'],
            color: '#000000',
            isSystemRole: true,
            restaurantId: null,
          },
        });
        console.log('✅ SUPER_ADMIN role created automatically');
      }
    } catch (error) {
      console.error('❌ Failed to create SUPER_ADMIN role:', error);
    }
  }

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

    // Parse include parameter
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

    // Transform data to match expected response structure
    const transformedData = data.map((restaurant) => {
      const result: any = {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
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
          where: { role: { name: 'OWNER' } }, // Assuming 'OWNER' is the role name
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

    // Calculate aggregated metrics (simplified version)
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);

    // Total revenue this month
    const revenue = await this.prisma.order.aggregate({
      where: {
        restaurantId: id,
        status: { in: ['DELIVERED', 'READY'] }, // status 'COMPLETED' does not exist in schema enum
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
          newStatus: newStatus,
          reason: dto.reason,
        },
      },
    });

    return updated;
  }

  async updateSubscription(
    id: string,
    dto: UpdateSubscriptionDto,
    adminId: string,
  ) {
    // Get plan enum
    const plan = dto.planType as PlanType; // Validate properly if strict
    // Assuming PlanType enum matches string

    const previous = await this.prisma.subscription.findUnique({
      where: { restaurantId: id },
    });

    // Upsert subscription
    const updated = await this.prisma.subscription.upsert({
      where: { restaurantId: id },
      create: {
        restaurantId: id,
        planType: plan,
        status: 'ACTIVE',
        currentPeriodEnd: dto.validUntil
          ? new Date(dto.validUntil)
          : new Date(new Date().setMonth(new Date().getMonth() + 1)),
      },
      update: {
        planType: plan,
        currentPeriodEnd: dto.validUntil ? new Date(dto.validUntil) : undefined,
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CHANGE_PLAN',
        targetRestaurantId: id,
        details: {
          previousPlan: previous?.planType || 'NONE',
          newPlan: plan,
        },
      },
    });

    return updated;
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

    // Global revenue
    // Note: In a real large scale app, this would be pre-calculated or cached.
    // Here we aggregate on the fly.

    const revenueCurrent = await this.prisma.order.aggregate({
      where: {
        createdAt: { gte: startOfCurrentMonth },
        status: { in: ['PAID', 'DELIVERED', 'READY'] as any }, // casting for loose matching
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

  async getUsers(
    search?: string,
    role?: string,
    isActive?: string,
    limit: number = 10,
    offset: number = 0,
  ) {
    const where: any = {};

    // Search filter (name or email)
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Role filter
    if (role) {
      where.role = { name: role };
    }

    // Active status filter
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        skip: offset,
        take: limit,
        select: {
          id: true,
          email: true,
          name: true,
          restaurantId: true,
          isActive: true,
          createdAt: true,
          role: {
            select: {
              name: true,
            },
          },
          restaurant: {
            select: {
              name: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Transform data to match expected response structure
    const transformedUsers = users.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role?.name || null,
      restaurantId: user.restaurantId,
      restaurantName: user.restaurant?.name || null,
      createdAt: user.createdAt,
      isActive: user.isActive,
    }));

    return {
      data: transformedUsers,
      meta: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    };
  }

  async createRestaurant(dto: CreateRestaurantDto) {
    // Generate unique slug
    const baseSlug = dto.name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .trim();

    let slug = baseSlug;
    let counter = 1;
    while (await this.prisma.restaurant.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    // Create restaurant in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create restaurant
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
        },
      });

      // Find or create OWNER role for the restaurant
      let ownerRole = await tx.role.findFirst({
        where: {
          restaurantId: restaurant.id,
          name: 'OWNER',
        },
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

      // Use provided adminEmail or default to restaurant email
      const adminEmail = dto.adminEmail || dto.email;

      // Check if admin email already exists for this restaurant
      const existingUser = await tx.user.findFirst({
        where: {
          email: adminEmail,
          restaurantId: restaurant.id,
        },
      });

      if (existingUser) {
        throw new BadRequestException(
          'Ya existe un administrador con este email para este restaurante',
        );
      }

      // Create admin user for the restaurant
      const adminUser = await tx.user.create({
        data: {
          email: adminEmail,
          password: '', // Will be set later by the user
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
    // Find an owner or admin of the restaurant
    // We look for users associated with this restaurant.
    // Ideally we want the one with 'OWNER' role.

    // First, find the Role ID for 'OWNER' or check if role has name 'OWNER'
    // The Schema structure: User -> roleId -> Role. Role has name.

    const targetUser = await this.prisma.user.findFirst({
      where: {
        restaurantId,
      },
      include: { role: true },
      orderBy: { createdAt: 'asc' }, // usually the creator
    });

    if (!targetUser) {
      throw new NotFoundException('No users found for this restaurant');
    }

    // Call AuthService to generate token
    // We need to access generateToken or similar from AuthService.
    // Assuming authService.login(user) returns { access_token }

    const authResponse =
      await this.authService.generateAuthResponse(targetUser);
    // Note: AuthService.login usually takes a user object and returns token.
    // Check AuthService signature if needed.

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'IMPERSONATE',
        targetRestaurantId: restaurantId,
        details: {
          impersonatedUser: targetUser.email,
        },
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

  async updateUser(userId: string, dto: UpdateUserDto, adminId: string) {
    // Verificar que el usuario existe
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, restaurant: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Preparar los datos de actualización
    const updateData: any = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.roleId !== undefined) updateData.roleId = dto.roleId;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.avatar !== undefined) updateData.avatar = dto.avatar;

    // Actualizar el usuario
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        restaurantId: true,
        isActive: true,
        avatar: true,
        role: {
          select: {
            name: true,
          },
        },
        restaurant: {
          select: {
            name: true,
          },
        },
        updatedAt: true,
      },
    });

    // Registrar en audit log
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'UPDATE_USER',
        details: {
          updatedFields: Object.keys(updateData),
          previousValues: {
            name: user.name,
            email: user.email,
            roleId: user.roleId,
            isActive: user.isActive,
            avatar: user.avatar,
          },
        },
      },
    });

    return updatedUser;
  }

  async getRoles() {
    const roles = await this.prisma.role.findMany({
      select: {
        id: true,
        name: true,
        permissions: true,
        color: true,
        isSystemRole: true,
        restaurantId: true,
        restaurant: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [
        { isSystemRole: 'desc' }, // System roles first
        { name: 'asc' },
      ],
    });

    // Remove duplicates by name and permissions, keeping the first occurrence
    const uniqueRoles = roles.reduce((acc, role) => {
      const key = `${role.name}-${JSON.stringify(role.permissions)}`;
      if (!acc.has(key)) {
        acc.set(key, role);
      }
      return acc;
    }, new Map<string, any>());

    const rolesWithDescription = Array.from(uniqueRoles.values()).map(
      (role) => ({
        id: role.id,
        name: role.name,
        description: this.getRoleDescription(
          role.name,
          role.permissions as string[],
        ),
        permissions: role.permissions as string[],
        isSystemRole: role.isSystemRole,
        restaurant: role.restaurant?.name || null,
      }),
    );

    return { roles: rolesWithDescription };
  }

  private getRoleDescription(name: string, permissions: string[]): string {
    const descriptions: Record<string, string> = {
      SUPER_ADMIN: 'Super administrador con acceso total al sistema',
      Admin: 'Administrador del restaurante con permisos completos',
      Manager: 'Gerente con acceso a operaciones diarias',
      Waiter: 'Mesero con acceso a pedidos y mesas',
      Kitchen: 'Cocinero con acceso a pedidos de cocina',
      Delivery: 'Repartidor con acceso a entregas',
    };

    return (
      descriptions[name] ||
      `Rol personalizado con permisos: ${permissions.join(', ')}`
    );
  }

  async createManualOrder(
    restaurantId: string,
    createOrderDto: any,
    adminId: string,
  ) {
    // Verificar que el restaurante existe
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        name: true,
        slug: true,
      },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    // Validar que los platos existen
    const dishIds = createOrderDto.items.map((item: any) => item.dishId);
    const dishes = await this.prisma.dish.findMany({
      where: {
        id: { in: dishIds },
        restaurantId,
      },
    });

    if (dishes.length !== dishIds.length) {
      throw new BadRequestException(
        'Algunos platos no existen o no pertenecen al restaurante',
      );
    }

    // Calcular totales
    const orderItems = createOrderDto.items.map((item: any) => {
      const dish = dishes.find((d) => d.id === item.dishId);
      if (!dish)
        throw new BadRequestException(`Plato ${item.dishId} no encontrado`);

      return {
        dishId: item.dishId,
        name: dish.name,
        quantity: item.quantity,
        unitPrice: item.unitPrice ?? dish.price,
        subtotal: (item.unitPrice ?? dish.price) * item.quantity,
        notes: item.notes,
      };
    });

    const subtotal =
      createOrderDto.subtotal ??
      orderItems.reduce((sum: number, item: any) => sum + item.subtotal, 0);
    const deliveryFee = createOrderDto.deliveryFee ?? 0;
    const tip = createOrderDto.tip ?? 0;
    const total = createOrderDto.total ?? subtotal + deliveryFee + tip;

    // Generar número de orden
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const ordersCount = await this.prisma.order.count({
      where: {
        restaurantId,
        createdAt: {
          gte: startOfDay,
          lt: endOfDay,
        },
      },
    });

    const orderNumber = `OD-${dateStr}-${String(ordersCount + 1).padStart(3, '0')}`;

    // Generar token de tracking público único
    const crypto = require('crypto');
    const publicTrackingToken = crypto.randomBytes(32).toString('base64url');

    // Crear la orden directamente como PAID (paymentStatus)
    // El status de la orden comienza en CONFIRMED para pedidos manuales (ya que están pagados y listos para cocina)
    const order = await this.prisma.order.create({
      data: {
        orderNumber,
        restaurantId,
        publicTrackingToken,
        customerName: createOrderDto.customerName,
        customerEmail: createOrderDto.customerEmail,
        customerPhone: createOrderDto.customerPhone,
        type: createOrderDto.type,
        status: 'PREPARING', // Estado en preparación para que aparezca en cocina
        paymentMethod: createOrderDto.paymentMethod ?? 'cash',
        paymentStatus: 'PAID', // Ya está pagado (creado manualmente por admin)
        paidAt: new Date(),
        confirmedAt: new Date(), // Confirmado automáticamente
        preparingAt: new Date(), // En preparación automáticamente
        subtotal,
        deliveryFee,
        tip,
        total,
        deliveryAddress: createOrderDto.deliveryAddress,
        deliveryNotes: createOrderDto.deliveryNotes,
        tableId: createOrderDto.tableId,
        notes: createOrderDto.notes,
        items: {
          create: orderItems.map((item: any) => ({
            dishId: item.dishId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            notes: item.notes,
          })),
        },
        statusHistory: {
          create: {
            toStatus: 'PREPARING',
            changedBy: adminId,
            notes:
              'Pedido creado y puesto en preparación manualmente por SUPER_ADMIN',
          },
        },
      },
      include: {
        items: {
          include: {
            dish: true,
          },
        },
        statusHistory: true,
        restaurant: true,
      },
    });

    // Emitir notificación SSE para cocina
    this.kitchenNotifications.emitNotification(order.restaurantId, {
      type: 'order_updated',
      orderId: order.id,
      data: {
        orderNumber: order.orderNumber,
        status: 'PREPARING',
        customerName: order.customerName,
        type: order.type,
        items: order.items.map((item) => ({
          name: item.dish.name,
          quantity: item.quantity,
          notes: item.notes,
        })),
        total: order.total,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      },
    });

    // Registrar en audit log
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CREATE_MANUAL_ORDER',
        targetRestaurantId: restaurantId,
        details: {
          orderId: order.id,
          orderNumber: order.orderNumber,
          total: order.total,
        },
      },
    });

    return {
      success: true,
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: order.total,
        createdAt: order.createdAt,
      },
    };
  }
}
