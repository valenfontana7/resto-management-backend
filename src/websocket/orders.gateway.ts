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
import { Logger } from '@nestjs/common';

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
    origin: '*',
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

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
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

  @SubscribeMessage('join-restaurant')
  handleJoinRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    const { restaurantId } = data;

    if (!restaurantId) {
      return { error: 'restaurantId is required' };
    }

    // Join the socket room for this restaurant
    client.join(`restaurant:${restaurantId}`);

    // Track the client
    if (!this.restaurantClients.has(restaurantId)) {
      this.restaurantClients.set(restaurantId, new Set());
    }
    this.restaurantClients.get(restaurantId)!.add(client.id);

    this.logger.log(`Client ${client.id} joined restaurant ${restaurantId}`);

    return { success: true, message: `Joined restaurant ${restaurantId}` };
  }

  @SubscribeMessage('leave-restaurant')
  handleLeaveRestaurant(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { restaurantId: string },
  ) {
    const { restaurantId } = data;

    if (!restaurantId) {
      return { error: 'restaurantId is required' };
    }

    // Leave the socket room
    client.leave(`restaurant:${restaurantId}`);

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
