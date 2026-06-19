import { Injectable, Logger } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { MessageEvent } from '@nestjs/common';

export interface KitchenNotification {
  type:
    | 'order_created'
    | 'order_updated'
    | 'order_cancelled'
    | 'order_ready'
    | 'in_app';
  orderId?: string;
  notificationId?: string;
  restaurantId: string;
  data: any;
  timestamp: Date;
}

@Injectable()
export class KitchenNotificationsService {
  private readonly logger = new Logger(KitchenNotificationsService.name);

  // Mapa de restaurantes a sus conexiones SSE activas
  private restaurantConnections = new Map<string, Subject<MessageEvent>[]>();

  // Mapa de restaurantes a sus Subjects de notificaciones
  private restaurantSubjects = new Map<string, Subject<KitchenNotification>>();

  /**
   * Obtiene el Observable de notificaciones para un restaurante
   */
  getNotificationsForRestaurant(
    restaurantId: string,
  ): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      // Crear un subject para este restaurante si no existe
      if (!this.restaurantSubjects.has(restaurantId)) {
        this.restaurantSubjects.set(
          restaurantId,
          new Subject<KitchenNotification>(),
        );
        this.restaurantConnections.set(restaurantId, []);
        this.logger.log(
          `✨ Nuevo subject creado para restaurante ${restaurantId}`,
        );
      }

      const subject = this.restaurantSubjects.get(restaurantId)!;
      const connections = this.restaurantConnections.get(restaurantId)!;

      this.logger.log(
        `📡 Nueva conexión SSE para restaurante ${restaurantId}. Total: ${connections.length + 1}`,
      );

      // Suscribirse a las notificaciones del restaurante y enviarlas al observer
      const subscription = subject.subscribe((notification) => {
        const messageEvent: MessageEvent = {
          data: JSON.stringify(notification),
          type: notification.type,
          id: notification.orderId,
        };

        this.logger.log(
          `📤 Enviando notificación SSE: ${notification.type} - Order: ${notification.orderId}`,
        );
        observer.next(messageEvent);
      });

      // Guardar referencia para contar conexiones
      connections.push(subscription as any);

      // Limpiar cuando se desconecte
      return () => {
        subscription.unsubscribe();
        const index = connections.indexOf(subscription as any);
        if (index > -1) {
          connections.splice(index, 1);
        }

        this.logger.log(
          `❌ Conexión SSE cerrada para restaurante ${restaurantId}. Restantes: ${connections.length}`,
        );

        // Limpiar si no hay más conexiones para este restaurante
        if (connections.length === 0) {
          this.restaurantSubjects.delete(restaurantId);
          this.restaurantConnections.delete(restaurantId);
          this.logger.log(
            `🧹 Subject eliminado para restaurante ${restaurantId} (sin conexiones)`,
          );
        }
      };
    });
  }

  /**
   * Emite una notificación a todas las conexiones SSE de un restaurante
   */
  emitNotification(
    restaurantId: string,
    notification: Omit<KitchenNotification, 'restaurantId' | 'timestamp'>,
  ) {
    const subject = this.restaurantSubjects.get(restaurantId);
    if (subject) {
      const fullNotification: KitchenNotification = {
        ...notification,
        restaurantId,
        timestamp: new Date(),
      };

      subject.next(fullNotification);
      this.logger.log(
        `Notificación emitida para restaurante ${restaurantId}: ${notification.type}`,
      );
    }
  }

  /**
   * Obtiene el número de conexiones activas para un restaurante
   */
  getActiveConnectionsCount(restaurantId: string): number {
    return this.restaurantConnections.get(restaurantId)?.length || 0;
  }

  /**
   * Obtiene estadísticas de conexiones
   */
  getConnectionStats() {
    const stats = {};
    for (const [restaurantId, connections] of this.restaurantConnections) {
      stats[restaurantId] = connections.length;
    }
    return stats;
  }
}
