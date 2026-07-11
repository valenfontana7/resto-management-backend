import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { FloorController } from './floor.controller';
import { TableSessionService } from './services/table-session.service';
import { CashRegisterService } from './services/cash-register.service';
import { FiscalDocumentService } from './services/fiscal-document.service';
import { FloorDiscountService } from './services/floor-discount.service';
import { TerminalService } from './services/terminal.service';
import { DailyOperationService } from './services/daily-operation.service';
import { MainCashRegisterService } from './services/main-cash-register.service';
import { FloorIdempotencyService } from './services/floor-idempotency.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { OrdersModule } from '../orders/orders.module';
import { FiscalModule } from '../fiscal/fiscal.module';
import { RestaurantsModule } from '../restaurants/restaurants.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { SalonDeliveryOrderService } from './services/salon-delivery-order.service';
import { FloorDesktopBootstrapService } from './services/floor-desktop-bootstrap.service';
import { FiscalRetrySchedulerService } from './services/fiscal-retry-scheduler.service';
import { FloorAccessService } from './services/floor-access.service';
import { TablesModule } from '../tables/tables.module';
import { StorageModule } from '../storage/storage.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessHealthModule } from '../business-health/business-health.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { EventSpineModule } from '../event-spine/event-spine.module';
import { EdgeSyncLocalModule } from '../edge-sync/edge-sync-local.module';

@Module({
  imports: [
    PrismaModule,
    CommonModule,
    BusinessHealthModule,
    BusinessEventsModule,
    forwardRef(() => EventSpineModule),
    EdgeSyncLocalModule,
    forwardRef(() => KitchenModule),
    FiscalModule,
    DeliveryModule,
    TablesModule,
    StorageModule,
    NotificationsModule,
    ScheduleModule.forRoot(),
    forwardRef(() => OrdersModule),
    forwardRef(() => RestaurantsModule),
  ],
  controllers: [FloorController],
  providers: [
    TableSessionService,
    CashRegisterService,
    FiscalDocumentService,
    FloorDiscountService,
    TerminalService,
    DailyOperationService,
    MainCashRegisterService,
    FloorIdempotencyService,
    SalonDeliveryOrderService,
    FloorDesktopBootstrapService,
    FiscalRetrySchedulerService,
    FloorAccessService,
  ],
  exports: [
    TableSessionService,
    CashRegisterService,
    FiscalDocumentService,
    TerminalService,
    DailyOperationService,
    MainCashRegisterService,
    FloorIdempotencyService,
  ],
})
export class FloorModule {}
