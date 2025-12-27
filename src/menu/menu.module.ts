import { Module } from '@nestjs/common';
import { CategoriesController } from './categories/categories.controller';
import { CategoriesService } from './categories/categories.service';
import { DishesController } from './dishes/dishes.controller';
import { DishesService } from './dishes/dishes.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [CategoriesController, DishesController],
  providers: [CategoriesService, DishesService],
})
export class MenuModule {}
