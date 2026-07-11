import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { isPrivilegedRole, normalizeRoleCode } from '../utils/role.utils';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator';

export const RESTAURANT_ID_PARAM = 'restaurantIdParam';

/**
 * Decorador para especificar el nombre del parámetro que contiene el restaurantId
 * @param paramName Nombre del parámetro (default: 'id')
 */
export const RestaurantIdParam = (paramName: string = 'id') =>
  Reflect.metadata(RESTAURANT_ID_PARAM, paramName);

/**
 * Guard que verifica que el usuario actual pertenece al restaurante
 * especificado en los parámetros de la ruta.
 *
 * Uso:
 * ```typescript
 * @UseGuards(JwtAuthGuard, RestaurantOwnerGuard)
 * @RestaurantIdParam('restaurantId') // opcional, default es 'id'
 * @Get(':restaurantId/orders')
 * async getOrders(@Param('restaurantId') restaurantId: string) { ... }
 * ```
 */
@Injectable()
export class RestaurantOwnerGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Obtener el nombre del parámetro desde el decorador o usar 'id' por defecto
    const paramName =
      this.reflector.get<string>(RESTAURANT_ID_PARAM, context.getHandler()) ||
      this.reflector.get<string>(RESTAURANT_ID_PARAM, context.getClass()) ||
      'id';

    const restaurantId = request.params[paramName];

    if (!restaurantId) {
      // Si no hay parámetro de restaurantId, permitir (el controller lo manejará)
      return true;
    }

    if (
      isPrivilegedRole(user.role) &&
      normalizeRoleCode(user.role) === 'SUPER_ADMIN'
    ) {
      return true;
    }

    // Verificar que el usuario pertenece a este restaurante
    if (user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }

    return true;
  }
}
