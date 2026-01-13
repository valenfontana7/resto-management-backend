import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { UserPaymentMethodsService } from './user-payment-methods.service';
import { UserPaymentMethodsController } from './user-payment-methods.controller';

@Module({
  imports: [PrismaModule, MercadoPagoModule],
  controllers: [UserPaymentMethodsController],
  providers: [UserPaymentMethodsService],
  exports: [UserPaymentMethodsService],
})
export class UsersModule {}
