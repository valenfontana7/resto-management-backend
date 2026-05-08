import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import {
  RegisterDto,
  LoginDto,
  LoginIntentDto,
  CompletePasswordSetupDto,
} from './dto/auth.dto';
import { User } from '@prisma/client';
import { AdminAlertsService } from '../admin-alerts/admin-alerts.service';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  roleId: string | null;
  restaurantId: string | null;
  roleName?: string | null;
  restaurantSlug?: string | null;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    roleId: string | null;
    restaurantId: string | null;
    roleName?: string | null;
    restaurantSlug?: string | null;
  };
  token: string;
  expiresAt: string;
  needsSetup?: boolean;
}

export interface LoginIntentResponse {
  mode: 'password' | 'password_setup';
  email: string;
  name?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
  ) {}

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    // Verificar si el email ya existe
    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
      },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Si se proporciona nombre de restaurante, verificar que no exista
    let slug: string | undefined;
    if (dto.restaurantName) {
      slug = this.generateSlug(dto.restaurantName);
      const existingRestaurant = await this.prisma.restaurant.findUnique({
        where: { slug },
      });

      if (existingRestaurant) {
        throw new ConflictException('Restaurant name already taken');
      }
    }

    // Hash de la contraseña
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    // Si NO se proporciona restaurantName, crear solo el usuario
    if (!dto.restaurantName) {
      const user = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: dto.name,
          isActive: true,
          // No tiene restaurante ni rol por ahora
        },
        select: {
          id: true,
          email: true,
          name: true,
        },
      });

      void this.adminAlerts?.notifyUserRegistered({
        source: 'auth.register',
        userId: user.id,
        name: user.name,
        email: user.email,
        restaurantId: null,
        restaurantName: null,
      });

      // Use generateAuthResponse to include proper claims (roleName, restaurantSlug)
      return await this.generateAuthResponse(user as any);
    }

    // Crear restaurante con roles del sistema y usuario admin en una transacción
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Crear restaurante
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.restaurantName as string,
          slug: slug as string,
          type: 'restaurant',
          cuisineTypes: [],
          email: normalizedEmail,
          phone: '',
          address: '',
          city: '',
          country: '',
          onboardingIncomplete: true,
        },
      });

      // 2. Crear roles del sistema
      const adminRole = await tx.role.create({
        data: {
          restaurantId: restaurant.id,
          name: 'Admin',
          permissions: ['all'],
          color: '#ef4444',
          isSystemRole: true,
        },
      });

      await tx.role.createMany({
        data: [
          {
            restaurantId: restaurant.id,
            name: 'Manager',
            permissions: [
              'dashboard',
              'menu',
              'orders',
              'reservations',
              'tables',
              'reports',
              'analytics',
              'kitchen',
              'delivery',
              'settings',
            ],
            color: '#f59e0b',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Waiter',
            permissions: ['orders', 'tables'],
            color: '#3b82f6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Kitchen',
            permissions: ['orders', 'kitchen'],
            color: '#8b5cf6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Delivery',
            permissions: ['orders', 'delivery'],
            color: '#10b981',
            isSystemRole: true,
          },
        ],
      });

      // 3. Crear usuario con rol Admin
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          name: dto.name,
          restaurantId: restaurant.id,
          roleId: adminRole.id,
        },
      });

      return { user, restaurant };
    });

    void this.adminAlerts?.notifyUserRegistered({
      source: 'auth.register',
      userId: result.user.id,
      name: result.user.name,
      email: result.user.email,
      restaurantId: result.restaurant.id,
      restaurantName: result.restaurant.name,
    });

    void this.adminAlerts?.notifyRestaurantCreated({
      source: 'auth.register',
      restaurantId: result.restaurant.id,
      restaurantName: result.restaurant.name,
      restaurantSlug: result.restaurant.slug,
      ownerEmail: result.user.email,
    });

    return await this.generateAuthResponse(result.user);
  }

  async getLoginIntent(dto: LoginIntentDto): Promise<LoginIntentResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      select: {
        email: true,
        name: true,
        isActive: true,
        passwordSetupRequired: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    const hasConfiguredActiveUser = users.some(
      (user) => user.isActive && !user.passwordSetupRequired,
    );

    if (hasConfiguredActiveUser) {
      return { mode: 'password', email: normalizedEmail };
    }

    const pendingUser = users.find(
      (user) => user.isActive && user.passwordSetupRequired,
    );

    if (!pendingUser) {
      return { mode: 'password', email: normalizedEmail };
    }

    return {
      mode: 'password_setup',
      email: normalizedEmail,
      name: pendingUser.name,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      include: {
        restaurant: {
          include: {
            hours: true,
          },
        },
        role: true,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activeUsers = users.filter((user) => user.isActive);
    const configuredActiveUsers = activeUsers.filter(
      (user) => !user.passwordSetupRequired,
    );

    for (const candidate of configuredActiveUsers) {
      const isPasswordValid = await bcrypt.compare(
        dto.password,
        candidate.password,
      );

      if (!isPasswordValid) {
        continue;
      }

      const updatedUser = await this.prisma.user.update({
        where: { id: candidate.id },
        data: { lastLogin: new Date() },
        include: {
          restaurant: {
            include: {
              hours: true,
            },
          },
          role: true,
        },
      });

      return await this.generateAuthResponse(updatedUser as User);
    }

    if (configuredActiveUsers.length === 0) {
      if (activeUsers.some((user) => user.passwordSetupRequired)) {
        throw new UnauthorizedException('Password setup required');
      }

      if (users.some((user) => !user.isActive)) {
        throw new UnauthorizedException('User account is inactive');
      }
    }

    throw new UnauthorizedException('Invalid credentials');
  }

  async completePasswordSetup(
    dto: CompletePasswordSetupDto,
  ): Promise<AuthResponse> {
    const normalizedEmail = this.normalizeEmail(dto.email);

    const users = await this.prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });

    if (users.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const activePendingUsers = users.filter(
      (user) => user.isActive && user.passwordSetupRequired,
    );

    if (activePendingUsers.length === 0) {
      if (users.some((user) => !user.isActive)) {
        throw new UnauthorizedException('User account is inactive');
      }

      throw new BadRequestException('Password already configured');
    }

    const primaryPendingUser = activePendingUsers[0];

    if (
      !primaryPendingUser.activationCodeHash ||
      !primaryPendingUser.activationCodeExpiresAt
    ) {
      throw new BadRequestException('Activation code is not available');
    }

    if (primaryPendingUser.activationCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Activation code expired');
    }

    if (primaryPendingUser.activationCodeAttempts >= 5) {
      throw new BadRequestException('Activation code locked');
    }

    let matchedPendingUser: (typeof activePendingUsers)[number] | null = null;

    for (const candidate of activePendingUsers) {
      if (
        !candidate.activationCodeHash ||
        !candidate.activationCodeExpiresAt ||
        candidate.activationCodeAttempts >= 5 ||
        candidate.activationCodeExpiresAt.getTime() < Date.now()
      ) {
        continue;
      }

      const isActivationCodeValid = await bcrypt.compare(
        dto.activationCode,
        candidate.activationCodeHash,
      );

      if (!isActivationCodeValid) {
        continue;
      }

      matchedPendingUser = candidate;
      break;
    }

    if (!matchedPendingUser) {
      await this.prisma.user.update({
        where: { id: primaryPendingUser.id },
        data: { activationCodeAttempts: { increment: 1 } },
      });

      throw new UnauthorizedException('Invalid activation code');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const updatedUser = await this.prisma.user.update({
      where: { id: matchedPendingUser.id },
      data: {
        password: hashedPassword,
        passwordSetupRequired: false,
        activationCodeHash: null,
        activationCodeExpiresAt: null,
        activationCodeAttempts: 0,
        lastLogin: new Date(),
      },
      include: {
        restaurant: {
          include: {
            hours: true,
          },
        },
        role: true,
      },
    });

    return await this.generateAuthResponse(updatedUser as User);
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        restaurant: true,
        role: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return user;
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            permissions: true,
            color: true,
          },
        },
        restaurantId: true,
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
            status: true,
          },
        },
        createdAt: true,
        updatedAt: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    return { user };
  }

  private mapRoleForResponse(
    role: { id: string; name: string; permissions: any; color: string } | null,
  ) {
    if (!role) return null;
    const roleCode = this.mapRoleNameToCode(role.name);
    if (roleCode) return roleCode;

    return {
      id: role.id,
      name: role.name,
      permissions: this.normalizePermissions(
        this.coercePermissions(role.permissions),
      ),
      color: role.color,
    };
  }

  private coercePermissions(permissions: any): string[] {
    if (!permissions) return [];
    if (Array.isArray(permissions)) {
      return permissions.filter((p) => typeof p === 'string');
    }
    if (typeof permissions === 'string') return [permissions];
    return [];
  }

  private mapRoleNameToCode(roleName?: string | null): string | null {
    if (!roleName) return null;
    const normalized = roleName.trim().toUpperCase();

    const map: Record<string, string> = {
      SUPER_ADMIN: 'SUPER_ADMIN',
      OWNER: 'OWNER',
      ADMIN: 'ADMIN',
      MANAGER: 'MANAGER',
      WAITER: 'WAITER',
      CHEF: 'CHEF',
      KITCHEN: 'KITCHEN',
      DELIVERY: 'DELIVERY',
    };

    if (map[normalized]) return map[normalized];

    const friendlyMap: Record<string, string> = {
      ADMINISTRATOR: 'ADMIN',
      ADMINISTRADOR: 'ADMIN',
      GERENTE: 'MANAGER',
      MOZO: 'WAITER',
      COCINA: 'KITCHEN',
      REPARTO: 'DELIVERY',
      REPARTIDOR: 'DELIVERY',
    };

    return friendlyMap[normalized] || null;
  }

  private normalizePermissions(permissions: string[]) {
    if (permissions.includes('all')) return ['all'];

    const mapping: Record<string, string[]> = {
      manage_menu: ['menu'],
      manage_orders: ['orders'],
      view_orders: ['orders'],
      update_order_status: ['orders', 'kitchen'],
      view_reports: ['reports'],
      manage_tables: ['tables'],
      view_tables: ['tables'],
      manage_reservations: ['reservations'],
      take_orders: ['orders'],
      view_delivery_orders: ['delivery', 'orders'],
      update_delivery_status: ['delivery'],
      manage_payments: ['billing'],
    };

    const allowed = new Set([
      'orders',
      'reservations',
      'menu',
      'reports',
      'tables',
      'kitchen',
      'delivery',
      'promotions',
      'analytics',
      'settings',
      'billing',
      'branding',
      'dashboard',
    ]);

    const normalized = new Set<string>();
    for (const perm of permissions) {
      if (allowed.has(perm)) {
        normalized.add(perm);
        continue;
      }
      const mapped = mapping[perm] || [];
      for (const p of mapped) {
        if (allowed.has(p)) normalized.add(p);
      }
    }

    return Array.from(normalized);
  }

  async generateAuthResponse(user: User): Promise<AuthResponse> {
    // Ensure role and restaurant relations are present
    let fullUser: any = user;
    if (!user || !('role' in user) || !('restaurant' in user)) {
      fullUser = await this.prisma.user.findUnique({
        where: { id: user.id },
        include: { role: true, restaurant: true },
      });
      if (!fullUser) {
        throw new UnauthorizedException('User not found');
      }
    }

    const payload: JwtPayload = {
      sub: fullUser.id,
      email: fullUser.email,
      roleId: fullUser.roleId ?? null,
      restaurantId: fullUser.restaurantId ?? null,
      roleName: fullUser.role?.name ?? null,
      restaurantSlug: fullUser.restaurant?.slug ?? null,
    };

    const token = this.jwtService.sign(payload);

    // JWT expira en 7 días
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        roleId: fullUser.roleId ?? null,
        restaurantId: fullUser.restaurantId ?? null,
        roleName: fullUser.role?.name ?? null,
        restaurantSlug: fullUser.restaurant?.slug ?? null,
      },
      token,
      expiresAt: expiresAt.toISOString(),
      needsSetup: this.needsRestaurantSetup(fullUser.restaurant),
    };
  }

  // Public helper: generate AuthResponse (token + user) for a user id
  async createAuthResponseForUserId(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        restaurant: {
          include: {
            hours: true,
          },
        },
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return await this.generateAuthResponse(user as any);
  }

  async impersonate(
    restaurantId: string,
    adminId: string,
  ): Promise<AuthResponse> {
    // Verify restaurant exists
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurant not found');
    }

    // 1. Find a target user (prefer Owner/Admin)
    const rolesPriority = [
      'OWNER',
      'Owner',
      'ADMIN',
      'Admin',
      'MANAGER',
      'Manager',
    ];

    let targetUser: any = null;

    // Try finding by role name priority (active users)
    for (const roleName of rolesPriority) {
      targetUser = await this.prisma.user.findFirst({
        where: {
          restaurantId,
          role: { name: roleName },
          isActive: true,
        },
        include: { role: true, restaurant: true },
      });
      if (targetUser) break;
    }

    // Fallback: any active user, oldest first
    if (!targetUser) {
      targetUser = await this.prisma.user.findFirst({
        where: { restaurantId, isActive: true },
        include: { role: true, restaurant: true },
        orderBy: { createdAt: 'asc' },
      });
    }

    // If no active users, try to find and activate an inactive user
    if (!targetUser) {
      targetUser = await this.prisma.user.findFirst({
        where: { restaurantId, isActive: false },
        include: { role: true, restaurant: true },
        orderBy: { createdAt: 'asc' },
      });

      if (targetUser) {
        // Activate the user
        targetUser = await this.prisma.user.update({
          where: { id: targetUser.id },
          data: { isActive: true },
          include: { role: true, restaurant: true },
        });
      }
    }

    // If still no user found, create a temporary admin user
    if (!targetUser) {
      // Find or create OWNER role
      let ownerRole = await this.prisma.role.findFirst({
        where: {
          restaurantId,
          name: { in: ['OWNER', 'Owner'] },
        },
      });

      if (!ownerRole) {
        ownerRole = await this.prisma.role.create({
          data: {
            restaurantId,
            name: 'OWNER',
            permissions: ['all'],
            color: '#ef4444',
            isSystemRole: true,
          },
        });
      }

      // Create temporary admin user
      targetUser = await this.prisma.user.create({
        data: {
          email: `admin@${restaurant.slug}.temp`,
          password: '', // No password needed for impersonation
          name: `Admin ${restaurant.name}`,
          restaurantId,
          roleId: ownerRole.id,
          isActive: true,
        },
        include: { role: true, restaurant: true },
      });
    }

    // 2. Generate Token
    const authResponse = await this.generateAuthResponse(targetUser);

    // 3. Log Audit
    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'IMPERSONATE',
        targetRestaurantId: restaurantId,
        details: {
          impersonatedUserEmail: targetUser.email,
          impersonatedUserId: targetUser.id,
          roleName: targetUser.role?.name,
        },
      },
    });

    return authResponse;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private needsRestaurantSetup(restaurant: any): boolean {
    if (!restaurant) return true;

    // Check basic required fields for operation
    const hasBasicInfo = !!(
      restaurant.name &&
      restaurant.name.trim() !== '' &&
      restaurant.address &&
      restaurant.address.trim() !== '' &&
      restaurant.phone &&
      restaurant.phone.trim() !== ''
    );

    // Check if hours are configured
    const hasHours = restaurant.hours && restaurant.hours.length > 0;

    // Restaurant needs setup if basic info or hours are missing
    return !hasBasicInfo || !hasHours;
  }
}
