import {
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Decorador que verifica automáticamente que el usuario pertenece
 * al restaurante especificado en el parámetro de la ruta.
 *
 * Uso:
 * ```typescript
 * @Put(':id/hours')
 * async updateHours(
 *   @VerifyRestaurantAccess('id') restaurantId: string,
 *   @Body() dto: UpdateHoursDto,
 * ) {
 *   // El decorador ya verificó el acceso y retorna el restaurantId
 * }
 * ```
 *
 * @param paramName Nombre del parámetro de ruta (default: 'id')
 */
export const VerifyRestaurantAccess = createParamDecorator(
  (paramName: string = 'id', ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;
    const restaurantId = request.params[paramName];

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!restaurantId) {
      throw new ForbiddenException('Restaurant ID not provided');
    }

    // Allow SUPER_ADMIN to access any restaurant
    if (user.role === 'SUPER_ADMIN') {
      return restaurantId;
    }

    if (user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You can only access your own restaurant');
    }

    return restaurantId;
  },
);

/**
 * Decorador que verifica que el usuario tiene un rol específico
 * en el restaurante.
 *
 * Uso:
 * ```typescript
 * @Delete(':id/users/:userId')
 * async removeUser(
 *   @VerifyRestaurantRole('id', 'OWNER') restaurantId: string,
 * ) {
 *   // Solo el OWNER puede ejecutar esta acción
 * }
 * ```
 */
export const VerifyRestaurantRole = createParamDecorator(
  (
    data: { paramName?: string; role: string } | string,
    ctx: ExecutionContext,
  ): string => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // Normalizar argumentos
    const paramName = typeof data === 'string' ? 'id' : data.paramName || 'id';
    const requiredRole = typeof data === 'string' ? data : data.role;

    const restaurantId = request.params[paramName];

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!restaurantId) {
      throw new ForbiddenException('Restaurant ID not provided');
    }

    // Allow SUPER_ADMIN to bypass all checks
    if (user.role === 'SUPER_ADMIN') {
      return restaurantId;
    }

    if (user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You can only access your own restaurant');
    }

    if (user.role !== requiredRole) {
      throw new ForbiddenException(
        `Only ${requiredRole} can perform this action`,
      );
    }

    return restaurantId;
  },
);

/**
 * Helper function to verify restaurant access for controllers
 * that receive restaurantId from body/query instead of route params.
 *
 * Uso:
 * ```typescript
 * import { assertRestaurantAccess } from '../common';
 *
 * @Get('status')
 * async getStatus(
 *   @Query('restaurantId') restaurantId: string,
 *   @CurrentUser() user: RequestUser,
 * ) {
 *   assertRestaurantAccess(user, restaurantId);
 *   // ...
 * }
 * ```
 */
export function assertRestaurantAccess(
  user: { restaurantId?: string | null; role?: string } | undefined,
  restaurantId: string,
): void {
  if (!user) {
    throw new ForbiddenException('Unauthorized');
  }

  // Allow SUPER_ADMIN to access any restaurant
  if (user.role === 'SUPER_ADMIN') {
    return;
  }

  if (!user.restaurantId) {
    throw new ForbiddenException('User does not have a restaurant');
  }

  if (user.restaurantId !== restaurantId) {
    throw new ForbiddenException('You can only manage your own restaurant');
  }
}
