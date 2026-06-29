import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DishesController } from './dishes/dishes.controller';
import { DishesService } from './dishes/dishes.service';
import { ModifiersController } from './modifiers.controller';
import { ModifiersService } from './modifiers.service';
import { MenuAdminController } from './menu-admin.controller';
import { MenuAdminService } from './menu-admin.service';
import { StorageModule } from '../storage/storage.module';
import { PlansModule } from '../subscriptions/plans/plans.module';
import { BusinessEventsModule } from '../business-events/business-events.module';

@Module({
  imports: [StorageModule, PlansModule, BusinessEventsModule],
  controllers: [
    CategoriesController,
    DishesController,
    ModifiersController,
    MenuAdminController,
  ],
  providers: [
    CategoriesService,
    DishesService,
    ModifiersService,
    MenuAdminService,
  ],
})
export class MenuModule {}
