import { Module } from '@nestjs/common';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminRestaurantsService } from './services/super-admin-restaurants.service';
import { SuperAdminUsersService } from './services/super-admin-users.service';
import { SuperAdminOrdersService } from './services/super-admin-orders.service';
import { SuperAdminSubscriptionsService } from './services/super-admin-subscriptions.service';
import { AuthModule } from '../auth/auth.module';
import { KitchenModule } from '../kitchen/kitchen.module';

@Module({
  imports: [AuthModule, KitchenModule],
  controllers: [SuperAdminController],
  providers: [
    SuperAdminService,
    SuperAdminRestaurantsService,
    SuperAdminUsersService,
    SuperAdminOrdersService,
    SuperAdminSubscriptionsService,
  ],
  exports: [SuperAdminService],
})
export class SuperAdminModule {}
