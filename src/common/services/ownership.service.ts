import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Servicio centralizado para verificación de ownership de restaurantes.
 * Elimina la duplicación de verifyRestaurantOwnership en múltiples servicios.
 *
 * @example
 * ```typescript
 * // En cualquier servicio
 * await this.ownership.verifyUserOwnsRestaurant(restaurantId, userId);
 * ```
 */
@Injectable()
export class OwnershipService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verifica que un usuario tenga acceso a un restaurante.
   * Lanza ForbiddenException si no tiene permiso.
   *
   * @param restaurantId - ID del restaurante
   * @param userId - ID del usuario
   * @throws ForbiddenException si el usuario no tiene acceso
   */
  async verifyUserOwnsRestaurant(
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        users: {
          where: { id: userId },
          select: { id: true },
        },
      },
    });

    if (!restaurant || restaurant.users.length === 0) {
      throw new ForbiddenException(
        'You do not have permission to manage this restaurant',
      );
    }
  }

  /**
   * Verifica ownership usando la relación directa user.restaurantId.
   * Útil para casos donde el usuario tiene un solo restaurante asignado.
   *
   * @param restaurantId - ID del restaurante
   * @param userId - ID del usuario
   * @throws ForbiddenException si el usuario no tiene acceso
   */
  async verifyUserBelongsToRestaurant(
    restaurantId: string,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { name: true } },
      },
    });

    // SUPER_ADMIN can access any restaurant
    if (user?.role?.name === 'SUPER_ADMIN') {
      return;
    }

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }
  }

  /**
   * Obtiene el restaurante del usuario actual.
   * Útil para operaciones que necesitan el restaurantId del contexto.
   *
   * @param userId - ID del usuario
   * @returns El restaurante del usuario o null
   */
  async getUserRestaurant(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        restaurant: {
          select: {
            id: true,
            slug: true,
            name: true,
          },
        },
      },
    });

    return user?.restaurant ?? null;
  }

  /**
   * Verifica que el usuario tenga un rol específico en el restaurante.
   *
   * @param restaurantId - ID del restaurante
   * @param userId - ID del usuario
   * @param allowedRoles - Roles permitidos
   * @throws ForbiddenException si el usuario no tiene el rol requerido
   */
  async verifyUserRole(
    restaurantId: string,
    userId: string,
    allowedRoles: string[],
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        role: { select: { name: true } },
      },
    });

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }

    if (user.role && !allowedRoles.includes(user.role.name)) {
      throw new ForbiddenException(
        `This action requires one of these roles: ${allowedRoles.join(', ')}`,
      );
    }
  }
}
