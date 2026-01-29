import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector, ModuleRef } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private jwtService: JwtService,
    private moduleRef: ModuleRef,
  ) {
    console.log('JwtAuthGuard: Using CanActivate implementation');
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromRequest(request);

    // Rutas públicas: permitir acceso siempre, pero si viene token intentamos
    // hidratar request.user para que el handler pueda usar rol/restaurant.
    // Si el token es inválido, NO se corta la request (sigue siendo público).
    if (isPublic) {
      if (!token) return true;

      try {
        const payload = await this.jwtService.verifyAsync(token);
        const authService = this.moduleRef.get(AuthService, { strict: false });
        const freshUser = await authService.validateUser(payload.sub);
        request.user = {
          userId: freshUser.id,
          email: freshUser.email,
          roleId: freshUser.roleId ?? null,
          restaurantId: freshUser.restaurantId ?? null,
          role: freshUser.role?.name ?? null,
          restaurantSlug: freshUser.restaurant?.slug ?? null,
        };
      } catch {
        // ignore
      }

      return true;
    }

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);
      // Load fresh user from DB to avoid stale token data
      const authService = this.moduleRef.get(AuthService, { strict: false });
      const freshUser = await authService.validateUser(payload.sub);
      request.user = {
        userId: freshUser.id,
        email: freshUser.email,
        roleId: freshUser.roleId ?? null,
        restaurantId: freshUser.restaurantId ?? null,
        role: freshUser.role?.name ?? null,
        restaurantSlug: freshUser.restaurant?.slug ?? null,
      };
      return true;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromRequest(request: any): string | null {
    // Try Authorization header first (case-insensitive)
    const authHeader =
      request.headers.authorization || request.headers.Authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // For SSE endpoints, try query parameter
    if (request.query && request.query.token) {
      return request.query.token;
    }

    return null;
  }
}
