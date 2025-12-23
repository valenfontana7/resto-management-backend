import { Module } from '@nestjs/common';
import { MercadoPagoController } from './mercadopago.controller';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { MercadoPagoService } from './mercadopago.service';
import { EncryptionService } from './encryption.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [MercadoPagoController],
  providers: [
    EncryptionService,
    MercadoPagoCredentialsService,
    MercadoPagoService,
  ],
})
export class MercadoPagoModule {}
