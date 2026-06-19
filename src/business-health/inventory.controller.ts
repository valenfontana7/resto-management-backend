import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { InventoryService } from './inventory.service';
import {
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from './dto/inventory-item.dto';

@Controller('api/restaurants/:restaurantId/inventory-items')
@UseGuards(JwtAuthGuard)
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  @Get()
  list(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventory.list(restaurantId, user.userId);
  }

  @Post()
  create(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateInventoryItemDto,
  ) {
    return this.inventory.create(restaurantId, user.userId, dto);
  }

  @Patch(':itemId')
  update(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateInventoryItemDto,
  ) {
    return this.inventory.update(restaurantId, user.userId, itemId, dto);
  }

  @Delete(':itemId')
  remove(
    @Param('restaurantId') restaurantId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.inventory.remove(restaurantId, user.userId, itemId);
  }
}
