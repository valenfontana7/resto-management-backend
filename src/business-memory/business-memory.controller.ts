import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { BusinessMemoryService } from './business-memory.service';
import {
  QueryBusinessMemoryDto,
  ResolveBusinessMemoryByKeysDto,
  SyncInsightMemoriesDto,
  UpsertBusinessMemoryDto,
} from './dto/business-memory.dto';

@Controller('api/restaurants/:restaurantId/business-memory')
@UseGuards(JwtAuthGuard)
export class BusinessMemoryController {
  constructor(private readonly businessMemory: BusinessMemoryService) {}

  @Get('context')
  getContext(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('sinceDays') sinceDays?: string,
  ) {
    const parsed = sinceDays ? Number.parseInt(sinceDays, 10) : 7;
    return this.businessMemory.getContext(
      restaurantId,
      user.userId,
      Number.isFinite(parsed) ? parsed : 7,
    );
  }

  @Post('query')
  query(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: QueryBusinessMemoryDto,
  ) {
    return this.businessMemory.query(restaurantId, user.userId, dto);
  }

  @Post('upsert')
  upsert(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpsertBusinessMemoryDto,
  ) {
    return this.businessMemory.upsert(restaurantId, user.userId, dto);
  }

  @Post('sync-insights')
  syncInsights(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SyncInsightMemoriesDto,
  ) {
    return this.businessMemory.syncFromInsights(restaurantId, user.userId, dto);
  }

  @Patch(':id/resolve')
  resolveById(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.businessMemory.resolveById(restaurantId, user.userId, id);
  }

  @Post('resolve-by-keys')
  resolveByKeys(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ResolveBusinessMemoryByKeysDto,
  ) {
    return this.businessMemory.resolveByKeys(restaurantId, user.userId, dto);
  }

  @Post(':memoryKey/increment')
  incrementRecurrence(
    @Param('restaurantId') restaurantId: string,
    @Param('memoryKey') memoryKey: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.businessMemory.incrementRecurrence(
      restaurantId,
      user.userId,
      decodeURIComponent(memoryKey),
    );
  }
}
