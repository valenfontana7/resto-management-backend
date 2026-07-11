import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { OrdersController, PublicOrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderAnalyticsService } from './services/order-analytics.service';
import { OrderNotificationsService } from './services/order-notifications.service';
import { PaymentReconciliationService } from './services/payment-reconciliation.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { EmailModule } from '../email/email.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CouponsModule } from '../coupons/coupons.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { CustomersModule } from '../customers/customers.module';
import { BusinessHealthModule } from '../business-health/business-health.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { EventSpineModule } from '../event-spine/event-spine.module';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    PrismaModule,
    CommonModule,
    forwardRef(() => BusinessHealthModule),
    BusinessEventsModule,
    forwardRef(() => EventSpineModule),
    MercadoPagoModule,
    EmailModule,
    WebsocketModule,
    forwardRef(() => KitchenModule),
    forwardRef(() => NotificationsModule),
    CouponsModule,
    forwardRef(() => DeliveryModule),
    CustomersModule,
    LoyaltyModule,
  ],
  controllers: [OrdersController, PublicOrdersController],
  providers: [
    OrdersService,
    OrderAnalyticsService,
    OrderNotificationsService,
    PaymentReconciliationService,
  ],
  exports: [OrdersService, OrderNotificationsService],
})
export class OrdersModule {}
