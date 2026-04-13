import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class SuperAdminUsersService {
  private readonly logger = new Logger(SuperAdminUsersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getUsers(
    search?: string,
    role?: string,
    isActive?: string,
    limit: number = 10,
    offset: number = 0,
  ) {
    const where: any = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = { name: role };
    }

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

  async createUser(dto: CreateUserDto, adminId: string) {
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const role = await this.prisma.role.findUnique({
      where: { id: dto.roleId },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        name: dto.name,
        isActive: dto.isActive ?? true,
        roleId: dto.roleId,
      },
      select: {
        id: true,
        email: true,
        name: true,
        isActive: true,
        createdAt: true,
        role: {
          select: {
            name: true,
          },
        },
      },
    });

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'CREATE_USER',
        details: {
          userId: user.id,
          email: user.email,
          roleId: dto.roleId,
          isActive: user.isActive,
        },
      },
    });

    return user;
  }

  async updateUser(userId: string, dto: UpdateUserDto, adminId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: true, restaurant: true },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const updateData: any = {};

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.email !== undefined) updateData.email = dto.email;
    if (dto.password !== undefined) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }
    if (dto.roleId !== undefined) updateData.roleId = dto.roleId;
    if (dto.isActive !== undefined) updateData.isActive = dto.isActive;
    if (dto.avatar !== undefined) updateData.avatar = dto.avatar;

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

    await this.prisma.adminAuditLog.create({
      data: {
        adminId,
        action: 'UPDATE_USER',
        details: {
          updatedFields: Object.keys(updateData).filter(
            (field) => field !== 'password',
          ),
          passwordChanged: dto.password ? true : false,
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
      orderBy: [{ isSystemRole: 'desc' }, { name: 'asc' }],
    });

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
}
