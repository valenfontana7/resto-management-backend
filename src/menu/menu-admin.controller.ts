import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { MenuAdminService } from './menu-admin.service';

@ApiTags('Menu')
@Controller()
export class MenuAdminController {
  constructor(private readonly menuAdmin: MenuAdminService) {}

  @Get('api/restaurants/:restaurantId/menu/admin')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin menu bundle (categories + dishes)' })
  @ApiParam({ name: 'restaurantId' })
  @ApiResponse({ status: 200, description: 'Categories and dishes retrieved' })
  getAdminMenu(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.menuAdmin.getAdminMenu(restaurantId, user.userId);
  }
}
