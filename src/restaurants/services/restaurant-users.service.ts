import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Servicio para gestión de usuarios de restaurante.
 * Extraído de RestaurantsService para cumplir con SRP (SOLID).
 */
@Injectable()
export class RestaurantUsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Obtener roles con permisos para un restaurante
   */
  async getRoles(restaurantId: string) {
    return this.prisma.role.findMany({
      where: { restaurantId },
      select: {
        id: true,
        name: true,
        permissions: true,
        color: true,
        isSystemRole: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Obtener todos los usuarios de un restaurante
   */
  async getRestaurantUsers(restaurantId: string) {
    return this.prisma.user.findMany({
      where: { restaurantId },
      select: {
        id: true,
        email: true,
        name: true,
        lastLogin: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Invitar un usuario a un restaurante
   * TODO: Implementar sistema de invitaciones con email y expiración
   */
  async inviteUser(
    restaurantId: string,
    inviteDto: {
      email: string;
      roleId?: string;
      roleName?: string;
      name?: string;
    },
  ) {
    const roleIdentifier = inviteDto.roleId || inviteDto.roleName;

    if (!roleIdentifier) {
      throw new BadRequestException('Either roleId or role name is required');
    }

    // Buscar rol
    const role = await this.findRole(restaurantId, roleIdentifier);

    if (!role) {
      throw new NotFoundException(
        `Role '${roleIdentifier}' not found in this restaurant`,
      );
    }

    // Verificar que el rol pertenece al restaurante
    if (role.restaurantId !== restaurantId) {
      throw new BadRequestException('Invalid role for this restaurant');
    }

    // Verificar si el usuario ya existe en el restaurante
    const existingUser = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        email: inviteDto.email,
      },
    });

    if (existingUser) {
      throw new ConflictException('User already exists in this restaurant');
    }

    // Crear usuario con contraseña temporal
    const hashedPassword = await bcrypt.hash('TempPassword123!', 10);

    return this.prisma.user.create({
      data: {
        name: inviteDto.name || inviteDto.email.split('@')[0],
        email: inviteDto.email,
        password: hashedPassword,
        restaurantId,
        roleId: role.id,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Actualizar rol y estado de un usuario
   */
  async updateUserRole(
    restaurantId: string,
    userId: string,
    updateDto: { roleId?: string; isActive?: boolean },
  ) {
    // Verificar que el usuario pertenece al restaurante
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    // Si se actualiza el rol, verificar que pertenece al restaurante
    if (updateDto.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: updateDto.roleId },
      });

      if (!role || role.restaurantId !== restaurantId) {
        throw new BadRequestException('Invalid role for this restaurant');
      }
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        roleId: updateDto.roleId,
        isActive: updateDto.isActive,
      },
      select: {
        id: true,
        email: true,
        name: true,
        roleId: true,
        role: {
          select: {
            id: true,
            name: true,
            color: true,
          },
        },
        isActive: true,
        createdAt: true,
      },
    });
  }

  /**
   * Eliminar usuario del restaurante (soft delete)
   */
  async removeUser(restaurantId: string, userId: string) {
    // Verificar que el usuario pertenece al restaurante
    const user = await this.prisma.user.findFirst({
      where: { id: userId, restaurantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this restaurant');
    }

    // Soft delete: desactivar usuario
    await this.prisma.user.update({
      where: { id: userId },
      data: { isActive: false },
    });

    return { success: true, message: 'User removed successfully' };
  }

  /**
   * Asociar un usuario existente con un restaurante
   */
  async associateUserWithRestaurant(userId: string, restaurantId: string) {
    // Verificar que el restaurante existe
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      throw new NotFoundException(
        `Restaurant with ID ${restaurantId} not found`,
      );
    }

    // Actualizar el usuario con el restaurantId
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { restaurantId },
      select: {
        id: true,
        email: true,
        restaurantId: true,
      },
    });

    // También conectar en la relación many-to-many
    await this.prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        users: {
          connect: { id: userId },
        },
      },
    });

    return updatedUser;
  }

  // ─── Métodos privados ───────────────────────────────────────────────

  private async findRole(restaurantId: string, roleIdentifier: string) {
    // Intentar buscar por ID primero
    let role = await this.prisma.role.findUnique({
      where: { id: roleIdentifier },
    });

    // Si no se encuentra por ID, buscar por nombre (case-insensitive)
    if (!role) {
      role = await this.prisma.role.findFirst({
        where: {
          restaurantId,
          name: {
            equals: roleIdentifier,
            mode: 'insensitive',
          },
        },
      });

      // Si aún no se encuentra, probar versión capitalizada
      if (!role && roleIdentifier.length > 0) {
        const capitalizedName =
          roleIdentifier.charAt(0).toUpperCase() +
          roleIdentifier.slice(1).toLowerCase();
        role = await this.prisma.role.findFirst({
          where: {
            restaurantId,
            name: capitalizedName,
          },
        });
      }
    }

    return role;
  }
}
