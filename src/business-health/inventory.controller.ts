import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
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

  @Get('export-pdf')
  async exportPdf(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const buffer = await this.inventory.exportPdf(restaurantId, user.userId);
    const filename = `inventario-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
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
