import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MercadoPagoController } from './mercadopago.controller';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoWebhookService } from './mercadopago-webhook.service';
import { EncryptionService } from './encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, ConfigModule, AuthModule],
  controllers: [MercadoPagoController],
  providers: [
    EncryptionService,
    MercadoPagoCredentialsService,
    MercadoPagoService,
    MercadoPagoWebhookService,
  ],
  exports: [
    MercadoPagoService,
    MercadoPagoCredentialsService,
    MercadoPagoWebhookService,
  ],
})
export class MercadoPagoModule {}
