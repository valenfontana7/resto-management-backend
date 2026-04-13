import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from './ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface OrderUpdatePayload {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  type: string;
  total: number;
  items: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
  }>;
  createdAt: Date;
  updatedAt?: Date;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map((s) => s.trim())
      : true, // reflejar origin cuando no está configurado (seguro en dev)
    credentials: true,
  },
  namespace: '/orders',
})
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(OrdersGateway.name);

  // Track which clients are listening to which restaurants
  private restaurantClients = new Map<string, Set<string>>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(`Client ${client.id} rejected: no token`);
        client.emit('error', { message: 'Authentication required' });
        client.disconnect();
        return;
      }

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
        this.logger.warn(`Client ${client.id} rejected: user not found`);
        client.emit('error', { message: 'User not found' });
        client.disconnect();
        return;
      }

      client.data.user = {
        userId: user.id,
        email: user.email,
        restaurantId: user.restaurantId,
        roleId: user.roleId,
        role: user.role?.name ?? null,
      };

      this.logger.log(`Client connected: ${client.id} (user: ${user.email})`);
    } catch {
      this.logger.warn(`Client ${client.id} rejected: invalid token`);
      client.emit('error', { message: 'Invalid or expired token' });
      client.disconnect();
    }
  }

  private extractToken(client: Socket): string | null {
    const authHeader =
      client.handshake.headers.authorization ??
      (client.handshake.headers as any).Authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }
    if (client.handshake.query?.token) {
      return client.handshake.query.token as string;
    }
    return null;
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Remove client from all restaurant rooms
    this.restaurantClients.forEach((clients, restaurantId) => {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.restaurantClients.delete(restaurantId);
      }
    });
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join-restaurant')
  async handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    const { restaurantId } = data;

    if (!restaurantId) {
      return { error: 'restaurantId is required' };
    }

    // Validate user belongs to this restaurant
    const user = client.data.user;
    if (user.role !== 'SUPER_ADMIN' && user.restaurantId !== restaurantId) {
      this.logger.warn(
        `Client ${client.id} (user: ${user.email}) denied access to restaurant ${restaurantId}`,
      );
      return { error: 'Access denied: you do not belong to this restaurant' };
    }

    // Join the socket room for this restaurant
    await client.join(`restaurant:${restaurantId}`);

    // Track the client
    if (!this.restaurantClients.has(restaurantId)) {
      this.restaurantClients.set(restaurantId, new Set());
    }
    this.restaurantClients.get(restaurantId)!.add(client.id);

    this.logger.log(`Client ${client.id} joined restaurant ${restaurantId}`);

    return { success: true, message: `Joined restaurant ${restaurantId}` };
  }

  @SubscribeMessage('leave-restaurant')
  async handleLeaveRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    const { restaurantId } = data;

    if (!restaurantId) {
      return { error: 'restaurantId is required' };
    }

    // Leave the socket room
    await client.leave(`restaurant:${restaurantId}`);

    // Remove from tracking
    const clients = this.restaurantClients.get(restaurantId);
    if (clients) {
      clients.delete(client.id);
      if (clients.size === 0) {
        this.restaurantClients.delete(restaurantId);
      }
    }

    this.logger.log(`Client ${client.id} left restaurant ${restaurantId}`);

    return { success: true, message: `Left restaurant ${restaurantId}` };
  }

  // ─────────────────────────────────────────────────────────────
  // Public methods to emit events from services
  // ─────────────────────────────────────────────────────────────

  /**
   * Emit a new order event to all clients listening to a restaurant
   */
  emitNewOrder(restaurantId: string, order: OrderUpdatePayload) {
    this.logger.log(
      `Emitting new order ${order.orderNumber} for restaurant ${restaurantId}`,
    );

    this.server.to(`restaurant:${restaurantId}`).emit('new-order', {
      type: 'new-order',
      restaurantId,
      order,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit an order update event to all clients listening to a restaurant
   */
  emitOrderUpdate(restaurantId: string, order: OrderUpdatePayload) {
    this.logger.log(
      `Emitting order update ${order.orderNumber} (${order.status}) for restaurant ${restaurantId}`,
    );

    this.server.to(`restaurant:${restaurantId}`).emit('order-update', {
      type: 'order-update',
      restaurantId,
      order,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Emit a payment confirmation event
   */
  emitPaymentConfirmed(restaurantId: string, order: OrderUpdatePayload) {
    this.logger.log(
      `Emitting payment confirmed for order ${order.orderNumber}`,
    );

    this.server.to(`restaurant:${restaurantId}`).emit('payment-confirmed', {
      type: 'payment-confirmed',
      restaurantId,
      order,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the count of connected clients for a restaurant
   */
  getConnectedClients(restaurantId: string): number {
    return this.restaurantClients.get(restaurantId)?.size || 0;
  }
}
