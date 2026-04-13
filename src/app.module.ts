import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { CacheModule } from '@nestjs/cache-manager';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RestaurantsModule } from './restaurants/restaurants.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { TablesModule } from './tables/tables.module';
import { PaymentsModule } from './payments/payments.module';
import { ReservationsModule } from './reservations/reservations.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DeliveryModule } from './delivery/delivery.module';
import { MercadoPagoModule } from './mercadopago/mercadopago.module';
import { UploadsModule } from './uploads/uploads.module';
import { EmailModule } from './email/email.module';
import { WebsocketModule } from './websocket/websocket.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { UsersModule } from './users/users.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { CouponsModule } from './coupons/coupons.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { FeatureFlagsGuard } from './common/guards/feature-flags.guard';

import { SuperAdminModule } from './super-admin/super-admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlansModule } from './subscriptions/plans/plans.module';
import { BuilderModule } from './builder/builder.module';
import { ReviewsModule } from './reviews/reviews.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ExperimentsModule } from './experiments/experiments.module';
import { DigestModule } from './digest/digest.module';
import { getJwtSecret } from './common/config/jwt.config';
import { validateEnvironment } from './common/config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
    }),
    // Redis-backed job queue (BullMQ) — only registered when REDIS_URL is set
    ...(process.env.REDIS_URL
      ? [
          BullModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: (config: ConfigService) => {
              const url = new URL(config.get<string>('REDIS_URL')!);
              return {
                connection: {
                  host: url.hostname,
                  port: parseInt(url.port || '6379', 10),
                  password: url.password || undefined,
                  maxRetriesPerRequest: null,
                },
              };
            },
            inject: [ConfigService],
          }),
        ]
      : []),
    // In-memory cache (swap to Redis store when ready)
    CacheModule.register({
      isGlobal: true,
      ttl: 60_000, // 60s default TTL
      max: 500, // max 500 items in memory
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 1 minuto
        limit: 100, // 100 requests por minuto por IP
      },
    ]),
    JwtModule.register({
      global: true,
      secret: getJwtSecret(process.env.JWT_SECRET),
      signOptions: { expiresIn: '24h' },
    }),
    PrismaModule,
    CommonModule, // Servicios compartidos (ownership, image processing)
    AuthModule,
    RestaurantsModule,
    MenuModule,
    OrdersModule,
    TablesModule,
    PaymentsModule,
    ReservationsModule,
    AnalyticsModule,
    DeliveryModule,
    MercadoPagoModule,
    UploadsModule,
    EmailModule,
    WebsocketModule,
    WebhooksModule,
    SubscriptionsModule,
    UsersModule,
    KitchenModule,
    CouponsModule,
    SuperAdminModule,
    NotificationsModule,
    PlansModule, // Importar PlansModule aquí para exponer endpoints públicos
    BuilderModule, // Website Builder module
    ReviewsModule,
    LoyaltyModule,
    IntegrationsModule,
    ExperimentsModule,
    DigestModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: FeatureFlagsGuard,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
