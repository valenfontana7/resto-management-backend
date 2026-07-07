import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsPublicController } from './restaurants-public.controller';
import { BranchesController } from './branches.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantUsersService } from './services/restaurant-users.service';
import { RestaurantBrandingV2Service } from './services/restaurant-branding-v2.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';
import { BranchesService } from './services/branches.service';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { MercadoPagoModule } from '../mercadopago/mercadopago.module';
import { EdgeSyncModule } from '../edge-sync/edge-sync.module';
import { GoLiveReadinessService } from './services/go-live-readiness.service';
import { GoLiveEnforcementModule } from './go-live-enforcement.module';
import { DemoExamplesModule } from '../demo-examples/demo-examples.module';

@Module({
  imports: [
    StorageModule,
    AuthModule,
    AdminAlertsModule,
    EmailModule,
    NotificationsModule,
    SubscriptionsModule,
    MercadoPagoModule,
    EdgeSyncModule,
    GoLiveEnforcementModule,
    DemoExamplesModule,
  ],
  controllers: [
    RestaurantsController,
    RestaurantsPublicController,
    BranchesController,
  ],
  providers: [
    RestaurantsService,
    RestaurantUsersService,
    RestaurantBrandingV2Service,
    RestaurantSettingsService,
    BranchesService,
    GoLiveReadinessService,
  ],
  exports: [
    RestaurantsService,
    RestaurantUsersService,
    RestaurantBrandingV2Service,
    RestaurantSettingsService,
    BranchesService,
    GoLiveEnforcementModule,
  ],
})
export class RestaurantsModule {}
