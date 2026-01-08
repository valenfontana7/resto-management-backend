import { Module, forwardRef } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { OrdersModule } from '../orders/orders.module';

@Module({
  imports: [MercadoPagoModule, forwardRef(() => OrdersModule)],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
