import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { DishRecipeService } from './dish-recipe.service';
import { UpsertDishRecipeDto } from './dto/dish-recipe.dto';

@Controller('api/restaurants/:restaurantId/dishes/:dishId/recipe')
@UseGuards(JwtAuthGuard)
export class DishRecipeController {
  constructor(private readonly dishRecipe: DishRecipeService) {}

  @Get()
  getRecipe(
    @Param('restaurantId') restaurantId: string,
    @Param('dishId') dishId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dishRecipe.getRecipe(restaurantId, user.userId, dishId);
  }

  @Put()
  upsertRecipe(
    @Param('restaurantId') restaurantId: string,
    @Param('dishId') dishId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpsertDishRecipeDto,
  ) {
    return this.dishRecipe.upsertRecipe(restaurantId, user.userId, dishId, dto);
  }

  @Post('sync-cost')
  syncCost(
    @Param('restaurantId') restaurantId: string,
    @Param('dishId') dishId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.dishRecipe.syncCostFromRecipe(
      restaurantId,
      user.userId,
      dishId,
    );
  }
}
