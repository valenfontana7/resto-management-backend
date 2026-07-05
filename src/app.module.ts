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
import { MaintenanceModeGuard } from './common/guards/maintenance-mode.guard';

import { SuperAdminModule } from './super-admin/super-admin.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PlansModule } from './subscriptions/plans/plans.module';
import { BuilderModule } from './builder/builder.module';
import { ReviewsModule } from './reviews/reviews.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { CustomersModule } from './customers/customers.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { ExperimentsModule } from './experiments/experiments.module';
import { DigestModule } from './digest/digest.module';
import { PaymentProvidersModule } from './payment-providers/payment-providers.module';
import { OnboardingAiModule } from './onboarding-ai/onboarding-ai.module';
import { OnboardingAnalyticsModule } from './onboarding-analytics/onboarding-analytics.module';
import { DemoExamplesModule } from './demo-examples/demo-examples.module';
import { LeadsModule } from './leads/leads.module';
import { RevenueModule } from './revenue/revenue.module';
import { AiPlatformModule } from './ai-platform/ai-platform.module';
import { CommercialIntelligenceModule } from './commercial-intelligence/commercial-intelligence.module';
import { FloorModule } from './floor/floor.module';
import { BusinessHealthModule } from './business-health/business-health.module';
import { BusinessMemoryModule } from './business-memory/business-memory.module';
import { BusinessEventsModule } from './business-events/business-events.module';
import { DecisionEngineModule } from './decision-engine/decision-engine.module';
import { CustomerEngagementModule } from './customer-engagement/customer-engagement.module';
import { LifecycleMarketingModule } from './lifecycle-marketing/lifecycle-marketing.module';
import { MarketingHubModule } from './marketing-hub/marketing-hub.module';
import { OwnerCommunicationsModule } from './owner-communications/owner-communications.module';
import { getJwtSecret } from './common/config/jwt.config';
import { validateEnvironment } from './common/config/env.validation';
import { isLocalMode } from './common/config/bentoo-mode.config';
import { LocalDiscoveryModule } from './local-discovery/local-discovery.module';
import { EdgeSyncModule } from './edge-sync/edge-sync.module';
import { SalonDesktopModule } from './salon-desktop/salon-desktop.module';
import { RedisModule } from './common/redis/redis.module';
import { createKeyv } from '@keyv/redis';
import { RedisThrottlerStorage } from './common/redis/redis-throttler.storage';

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
    RedisModule,
    CacheModule.registerAsync({
      isGlobal: true,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisUrl = config.get<string>('REDIS_URL')?.trim();
        if (redisUrl) {
          return {
            stores: [createKeyv(redisUrl)],
          };
        }
        return {
          ttl: 60_000,
          max: 500,
        };
      },
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService, RedisThrottlerStorage],
      useFactory: (
        config: ConfigService,
        redisStorage: RedisThrottlerStorage,
      ) => {
        const redisUrl = config.get<string>('REDIS_URL')?.trim();
        return {
          throttlers: [{ ttl: 60_000, limit: 100 }],
          ...(redisUrl ? { storage: redisStorage } : {}),
        };
      },
    }),
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
    CustomersModule,
    IntegrationsModule,
    ExperimentsModule,
    DigestModule,
    PaymentProvidersModule,
    OnboardingAiModule,
    OnboardingAnalyticsModule,
    DemoExamplesModule,
    AiPlatformModule,
    CommercialIntelligenceModule,
    LeadsModule,
    RevenueModule,
    FloorModule,
    BusinessHealthModule,
    BusinessMemoryModule,
    BusinessEventsModule,
    DecisionEngineModule,
    OwnerCommunicationsModule,
    CustomerEngagementModule,
    LifecycleMarketingModule,
    MarketingHubModule,
    EdgeSyncModule,
    SalonDesktopModule,
    ...(isLocalMode() ? [LocalDiscoveryModule] : []),
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
      useClass: MaintenanceModeGuard,
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
