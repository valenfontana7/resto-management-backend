import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { OrdersModule } from '../orders/orders.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';

@Module({
  imports: [
    MercadoPagoModule,
    forwardRef(() => OrdersModule),
    forwardRef(() => SubscriptionsModule),
  ],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
