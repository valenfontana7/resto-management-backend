import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { MercadoPagoController } from './mercadopago.controller';
import { MercadoPagoCredentialsService } from './mercadopago-credentials.service';
import { MercadoPagoService } from './mercadopago.service';
import { MercadoPagoWebhookService } from './mercadopago-webhook.service';
import { MercadoPagoOAuthService } from './mercadopago-oauth.service';
import { MercadoPagoOAuthRefreshTask } from './mercadopago-oauth-refresh.task';
import { EncryptionService } from './encryption.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { GoLiveEnforcementModule } from '../restaurants/go-live-enforcement.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    ScheduleModule.forRoot(),
    AuthModule,
    BusinessEventsModule,
    GoLiveEnforcementModule,
  ],
  controllers: [MercadoPagoController],
  providers: [
    EncryptionService,
    MercadoPagoCredentialsService,
    MercadoPagoService,
    MercadoPagoWebhookService,
    MercadoPagoOAuthService,
    MercadoPagoOAuthRefreshTask,
  ],
  exports: [
    MercadoPagoService,
    MercadoPagoCredentialsService,
    MercadoPagoWebhookService,
    MercadoPagoOAuthService,
    EncryptionService,
  ],
})
export class MercadoPagoModule {}
