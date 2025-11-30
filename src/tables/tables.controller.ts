import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { TablesService } from './tables.service';
import {
  CreateTableDto,
  UpdateTableDto,
  TableStatus,
  UpdateTableStatusDto,
  CreateTableAreaDto,
  UpdateTableAreaDto,
} from './dto/table.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('tables')
@Controller('api/tables')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TablesController {
  constructor(private readonly tablesService: TablesService) {}

  // ==================== TABLES ====================

  @Post('restaurant/:restaurantId')
  @ApiOperation({ summary: 'Create a new table' })
  @ApiResponse({ status: 201, description: 'Table created successfully' })
  async create(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() createDto: CreateTableDto,
  ) {
    return this.tablesService.create(restaurantId, user.userId, createDto);
  }

  @Get('restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get all tables organized by areas' })
  @ApiResponse({ status: 200, description: 'Tables retrieved successfully' })
  async findAll(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tablesService.findAll(restaurantId, user.userId);
  }

  @Get('restaurant/:restaurantId/stats')
  @ApiOperation({ summary: 'Get table statistics' })
  @ApiResponse({
    status: 200,
    description: 'Statistics retrieved successfully',
  })
  async getStats(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tablesService.getStats(restaurantId, user.userId);
  }

  @Get(':id/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Get table by ID' })
  @ApiResponse({ status: 200, description: 'Table retrieved successfully' })
  async findOne(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tablesService.findOne(id, restaurantId, user.userId);
  }

  @Patch(':id/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Update table configuration' })
  @ApiResponse({ status: 200, description: 'Table updated successfully' })
  async update(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() updateDto: UpdateTableDto,
  ) {
    return this.tablesService.update(id, restaurantId, user.userId, updateDto);
  }

  @Patch(':id/restaurant/:restaurantId/status/:status')
  @ApiOperation({ summary: 'Change table status' })
  @ApiResponse({
    status: 200,
    description: 'Table status updated successfully',
  })
  async changeStatus(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @Param('status') status: TableStatus,
    @CurrentUser() user: RequestUser,
    @Body() statusDto?: UpdateTableStatusDto,
  ) {
    return this.tablesService.changeStatus(
      id,
      restaurantId,
      user.userId,
      status,
      statusDto,
    );
  }

  @Delete(':id/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Delete table' })
  @ApiResponse({ status: 200, description: 'Table deleted successfully' })
  async delete(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tablesService.delete(id, restaurantId, user.userId);
  }

  // ==================== AREAS ====================

  @Post('restaurant/:restaurantId/areas')
  @ApiOperation({ summary: 'Create a new table area' })
  @ApiResponse({ status: 201, description: 'Area created successfully' })
  async createArea(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() createDto: CreateTableAreaDto,
  ) {
    return this.tablesService.createArea(restaurantId, user.userId, createDto);
  }

  @Get('restaurant/:restaurantId/areas')
  @ApiOperation({ summary: 'Get all table areas' })
  @ApiResponse({ status: 200, description: 'Areas retrieved successfully' })
  async findAllAreas(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tablesService.findAllAreas(restaurantId, user.userId);
  }

  @Patch('areas/:id/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Update table area' })
  @ApiResponse({ status: 200, description: 'Area updated successfully' })
  async updateArea(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() updateDto: UpdateTableAreaDto,
  ) {
    return this.tablesService.updateArea(
      id,
      restaurantId,
      user.userId,
      updateDto,
    );
  }

  @Delete('areas/:id/restaurant/:restaurantId')
  @ApiOperation({ summary: 'Delete table area' })
  @ApiResponse({ status: 200, description: 'Area deleted successfully' })
  async deleteArea(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.tablesService.deleteArea(id, restaurantId, user.userId);
  }
}
