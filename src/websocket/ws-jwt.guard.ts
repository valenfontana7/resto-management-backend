import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();

    const token = this.extractToken(client);
    if (!token) {
      throw new WsException('Authentication token required');
    }

    try {
      const payload = await this.jwtService.verifyAsync(token);

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          restaurantId: true,
          roleId: true,
          role: { select: { name: true } },
        },
      });

      if (!user) {
        throw new WsException('User not found');
      }

      // Attach user to socket data for later use
      client.data.user = {
        userId: user.id,
        email: user.email,
        restaurantId: user.restaurantId,
        roleId: user.roleId,
        role: user.role?.name ?? null,
      };

      return true;
    } catch (error) {
      if (error instanceof WsException) throw error;
      this.logger.warn(`WS auth failed for ${client.id}: ${error.message}`);
      throw new WsException('Invalid or expired token');
    }
  }

  private extractToken(client: Socket): string | null {
    // 1. Try auth handshake header (Authorization: Bearer <token>)
    const authHeader =
      client.handshake.headers.authorization ??
      client.handshake.headers.Authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // 2. Try handshake auth object (socket.io v4+ pattern)
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // 3. Try query parameter
    if (client.handshake.query?.token) {
      return client.handshake.query.token as string;
    }

    return null;
  }
}
