import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService, type JwtPayload } from '../auth.service';
import { getJwtSecret } from '../../common/config/jwt.config';

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
      secretOrKey: getJwtSecret(process.env.JWT_SECRET),
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
