import { KitchenOperationalEventHandler } from '../event-spine/handlers/kitchen-operational.handler';
import { RealtimeOperationalEventHandler } from '../event-spine/handlers/realtime-operational.handler';
import { OperationalEventHandlerRegistry } from '../event-spine/operational-event-handler.registry';
import { OperationalEventEmitter } from '../event-spine/operational-event-emitter.service';
import { KitchenNotificationsService } from '../kitchen/kitchen-notifications.service';
import { OrdersGateway } from '../websocket/orders.gateway';
import { TableSessionService } from '../floor/services/table-session.service';
import { EdgeSyncPushApplyService } from '../edge-sync/edge-sync-push-apply.service';
import { TenantHealthService } from '../tenant-health/tenant-health.service';
import { DeliveryService } from '../delivery/delivery.service';
import { OrdersService } from '../orders/orders.service';
import { OrderNotificationsService } from '../orders/services/order-notifications.service';

/**
 * Detecta imports circulares que dejan clases undefined en Linux CI
 * (provocan RuntimeException vacío en Nest al compilar AppModule).
 */
describe('DI import sanity', () => {
  const tokens = {
    KitchenOperationalEventHandler,
    RealtimeOperationalEventHandler,
    OperationalEventHandlerRegistry,
    OperationalEventEmitter,
    KitchenNotificationsService,
    OrdersGateway,
    TableSessionService,
    EdgeSyncPushApplyService,
    TenantHealthService,
    DeliveryService,
    OrdersService,
    OrderNotificationsService,
  };

  it.each(Object.entries(tokens))(
    '%s debe estar definido al importar',
    (_name, token) => {
      expect(token).toBeDefined();
      expect(typeof token).toBe('function');
    },
  );
});
