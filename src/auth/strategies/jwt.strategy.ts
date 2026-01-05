import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, type JwtPayload } from '../auth.service';

export interface RequestUser {
  userId: string;
  email: string;
  roleId: string | null;
  restaurantId: string | null;
  role?: string | null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
    });
  }

  async validate(payload: JwtPayload): Promise<RequestUser> {
    const user = await this.authService.validateUser(payload.sub);

    return {
      userId: user.id,
      email: user.email,
      roleId: user.roleId || null,
      restaurantId: user.restaurantId || null,
      role: user.role?.name || null,
    };
  }
}
