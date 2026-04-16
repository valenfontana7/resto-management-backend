import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../mercadopago/encryption.service';
import { MercadoPagoProvider } from './providers/mercadopago.provider';
import { PaywayProvider } from './providers/payway.provider';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentProviderCredentialsController } from './payment-provider-credentials.controller';
import { PaymentProviderCredentialsService } from './payment-provider-credentials.service';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [ConfigModule, AuthModule],
  controllers: [PaymentProviderCredentialsController],
  providers: [
    PrismaService,
    EncryptionService,
    MercadoPagoProvider,
    PaywayProvider,
    PaymentProviderFactory,
    PaymentProviderCredentialsService,
  ],
  exports: [PaymentProviderFactory, MercadoPagoProvider, PaywayProvider],
})
export class PaymentProvidersModule {}
