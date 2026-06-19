import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { normalizeRoleCode } from '../../common/utils/role.utils';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();

    // If user has no role, deny if roles are required
    if (!user || !user.role) {
      return false;
    }

    if (normalizeRoleCode(user.role) === 'SUPER_ADMIN') {
      return true;
    }

    const userCode = normalizeRoleCode(user.role);
    return requiredRoles.some((role) => userCode === normalizeRoleCode(role));
  }
}
