import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Guard that verifies the user's role has the required permissions.
 *
 * Permissions are stored as a JSON string array on the Role model,
 * e.g. ["orders", "menu", "tables"]. This guard loads the role's
 * permissions from the DB and checks that at least one of the
 * required permissions is present.
 *
 * SUPER_ADMIN and ADMIN roles bypass this check.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permissions required → allow
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;

    // Admin roles have full access
    if (user.role === 'SUPER_ADMIN' || user.role === 'Admin') {
      return true;
    }

    // Load the role's permissions from DB
    if (!user.roleId) return false;

    const role = await this.prisma.role.findUnique({
      where: { id: user.roleId },
      select: { permissions: true },
    });

    if (!role) return false;

    const rolePermissions = Array.isArray(role.permissions)
      ? (role.permissions as string[])
      : [];

    // Check if the role has at least one of the required permissions
    const hasPermission = requiredPermissions.some((perm) =>
      rolePermissions.includes(perm),
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        'You do not have permission to access this resource',
      );
    }

    return true;
  }
}
