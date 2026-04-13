import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DishesController } from './dishes/dishes.controller';
import { DishesService } from './dishes/dishes.service';
import { ModifiersController } from './modifiers.controller';
import { ModifiersService } from './modifiers.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [CategoriesController, DishesController, ModifiersController],
  providers: [CategoriesService, DishesService, ModifiersService],
})
export class MenuModule {}
