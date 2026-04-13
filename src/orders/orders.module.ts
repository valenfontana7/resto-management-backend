import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderAnalyticsService } from './services/order-analytics.service';
import { OrderNotificationsService } from './services/order-notifications.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { EmailModule } from '../email/email.module';
import { WebsocketModule } from '../websocket/websocket.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    CommonModule,
    MercadoPagoModule,
    EmailModule,
    WebsocketModule,
    forwardRef(() => KitchenModule),
    NotificationsModule,
    CouponsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrderAnalyticsService, OrderNotificationsService],
  exports: [OrdersService],
})
export class OrdersModule {}
