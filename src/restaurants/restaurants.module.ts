import { Module } from '@nestjs/common';
import { RestaurantsController } from './restaurants.controller';
import { RestaurantsPublicController } from './restaurants-public.controller';
import { RestaurantsService } from './restaurants.service';
import { RestaurantUsersService } from './services/restaurant-users.service';
import { RestaurantBrandingService } from './services/restaurant-branding.service';
import { RestaurantSettingsService } from './services/restaurant-settings.service';
import { StorageModule } from '../storage/storage.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [StorageModule, AuthModule],
  controllers: [RestaurantsController, RestaurantsPublicController],
  providers: [
    RestaurantsService,
    RestaurantUsersService,
    RestaurantBrandingService,
    RestaurantSettingsService,
  ],
  exports: [
    RestaurantsService,
    RestaurantUsersService,
    RestaurantBrandingService,
    RestaurantSettingsService,
  ],
})
export class RestaurantsModule {}
