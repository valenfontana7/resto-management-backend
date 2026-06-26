import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateUserDto } from '../dto/update-user.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { AdminAlertsService } from '../../admin-alerts/admin-alerts.service';

@Injectable()
export class SuperAdminUsersService {
  private readonly logger = new Logger(SuperAdminUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly adminAlerts?: AdminAlertsService,
  ) {}

  async getUsers(
    search?: string,
    role?: string,
    isActive?: string,
    limit: number = 10,
    offset: number = 0,
  ) {
    const where: any = {
      deletedAt: null,
    };

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
    const normalizedEmail = dto.email.trim().toLowerCase();

    const existingUser = await this.prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        deletedAt: null,
      },
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
        email: normalizedEmail,
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

    void this.adminAlerts?.notifyUserRegistered({
      source: 'super-admin.create-user',
      userId: user.id,
      name: user.name,
      email: user.email,
      restaurantId: null,
      restaurantName: null,
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

    const roleChanged =
      dto.roleId !== undefined &&
      dto.roleId !== null &&
      dto.roleId !== user.roleId;
    const statusChanged =
      dto.isActive !== undefined && dto.isActive !== user.isActive;
    const emailChanged =
      dto.email !== undefined && dto.email.trim() !== user.email;

    if (roleChanged || statusChanged || emailChanged) {
      void this.adminAlerts?.notifyAdminEvent({
        source: 'super-admin.update-user',
        event: 'USER_UPDATED',
        subject: '🛡️ Usuario actualizado por SUPER_ADMIN',
        title: 'Cambio importante en usuario',
        message: `Se actualizó el usuario ${updatedUser.email}${updatedUser.role?.name ? ` (${updatedUser.role.name})` : ''}.`,
        data: {
          userId: updatedUser.id,
          previousEmail: user.email,
          newEmail: updatedUser.email,
          previousRole: user.role?.name ?? null,
          newRole: updatedUser.role?.name ?? null,
          previousIsActive: user.isActive,
          newIsActive: updatedUser.isActive,
          restaurantId: updatedUser.restaurantId ?? null,
          restaurantName: updatedUser.restaurant?.name ?? null,
          updatedAt: updatedUser.updatedAt?.toISOString?.() ?? null,
        },
      });
    }

    return updatedUser;
  }

  async deleteUser(userId: string, adminId: string) {
    if (userId === adminId) {
      throw new BadRequestException(
        'No podes eliminar permanentemente tu propio usuario',
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: true,
        restaurant: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const roleName = user.role?.name ?? null;

    if (roleName === 'SUPER_ADMIN') {
      const remainingActiveSuperAdmins = await this.prisma.user.count({
        where: {
          id: { not: userId },
          deletedAt: null,
          isActive: true,
          role: {
            is: {
              name: 'SUPER_ADMIN',
            },
          },
        },
      });

      if (remainingActiveSuperAdmins === 0) {
        throw new BadRequestException(
          'No podes eliminar el ultimo SUPER_ADMIN activo',
        );
      }
    }

    const performedAuditLogs = await this.prisma.adminAuditLog.count({
      where: { adminId: userId },
    });

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.onboardingDraft.deleteMany({
          where: { userId: user.id },
        });

        await tx.pushSubscription.deleteMany({
          where: { userId: user.id },
        });

        await tx.authLoginLink.deleteMany({
          where: { userId: user.id },
        });

        await tx.authPasswordResetLink.deleteMany({
          where: { userId: user.id },
        });

        await tx.authEmailVerificationLink.deleteMany({
          where: { userId: user.id },
        });

        await tx.notification.deleteMany({
          where: { userId: user.id },
        });

        await tx.userPaymentMethod.deleteMany({
          where: { userId: user.id },
        });

        await tx.restaurantMembership.deleteMany({
          where: { userId: user.id },
        });

        await tx.deliveryDriver.updateMany({
          where: { userId: user.id },
          data: { userId: null },
        });

        await tx.subscription.updateMany({
          where: { userId: user.id },
          data: { userId: null },
        });

        await tx.adminAuditLog.deleteMany({
          where: { adminId: user.id },
        });

        await tx.user.delete({
          where: { id: user.id },
        });

        await tx.adminAuditLog.create({
          data: {
            adminId,
            action: 'DELETE_USER',
            targetRestaurantId: user.restaurantId,
            details: {
              deletedUserId: user.id,
              deletedUserEmail: user.email,
              deletedUserName: user.name,
              deletedUserRole: roleName,
              deletedUserRestaurantId: user.restaurantId,
              deletedUserRestaurantName: user.restaurant?.name ?? null,
              deletedUserWasActive: user.isActive,
              deletedUserCreatedAt: user.createdAt.toISOString(),
              deletedUserSoftDeletedAt: user.deletedAt?.toISOString() ?? null,
              removedPerformedAuditLogs: performedAuditLogs,
              hardDeleted: true,
            },
          },
        });
      });
    } catch (error) {
      this.rethrowUserDeleteError(error);
    }

    void this.adminAlerts?.notifyAdminEvent({
      source: 'super-admin.delete-user',
      event: 'USER_UPDATED',
      subject: 'Usuario eliminado permanentemente',
      title: 'Usuario eliminado permanentemente',
      message: `Se elimino permanentemente el usuario ${user.email}.`,
      data: {
        deletedUserId: user.id,
        deletedUserEmail: user.email,
        deletedUserRole: roleName,
        restaurantId: user.restaurantId,
        restaurantName: user.restaurant?.name ?? null,
        hardDeleted: true,
      },
    });

    return {
      success: true,
      id: user.id,
      email: user.email,
      hardDeleted: true,
      message: 'Usuario eliminado permanentemente',
    };
  }

  private rethrowUserDeleteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      throw new BadRequestException(
        'No se puede eliminar el usuario porque tiene datos vinculados en el sistema.',
      );
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Usuario no encontrado');
    }

    this.logger.error('Error eliminando usuario permanentemente', error);
    throw error;
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
