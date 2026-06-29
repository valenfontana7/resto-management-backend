import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { OrdersModule } from '../orders/orders.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    MercadoPagoModule,
    PrismaModule,
    BusinessEventsModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
