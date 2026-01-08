import {
  Injectable,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { User } from '@prisma/client';

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
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    // Verificar si el email ya existe
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
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
          email: dto.email,
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
          email: dto.email,
          phone: '',
          address: '',
          city: '',
          country: '',
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
              'manage_menu',
              'manage_orders',
              'view_reports',
              'manage_tables',
              'manage_reservations',
            ],
            color: '#f59e0b',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Waiter',
            permissions: ['take_orders', 'manage_orders', 'view_tables'],
            color: '#3b82f6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Kitchen',
            permissions: ['view_orders', 'update_order_status'],
            color: '#8b5cf6',
            isSystemRole: true,
          },
          {
            restaurantId: restaurant.id,
            name: 'Delivery',
            permissions: ['view_delivery_orders', 'update_delivery_status'],
            color: '#10b981',
            isSystemRole: true,
          },
        ],
      });

      // 3. Crear usuario con rol Admin
      const user = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          restaurantId: restaurant.id,
          roleId: adminRole.id,
        },
      });

      return { user, restaurant };
    });

    return await this.generateAuthResponse(result.user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: dto.email,
      },
      include: {
        restaurant: true,
        role: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is inactive');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update lastLogin timestamp
    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
      include: { restaurant: true, role: true },
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
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return { user };
  }

  private async generateAuthResponse(user: User): Promise<AuthResponse> {
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
    };
  }

  // Public helper: generate AuthResponse (token + user) for a user id
  async createAuthResponseForUserId(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, restaurant: true },
    });
    if (!user) throw new UnauthorizedException('User not found');
    return await this.generateAuthResponse(user as any);
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove accents
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
}
