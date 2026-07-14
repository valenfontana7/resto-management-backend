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
import { ProductFeedbackStatus, ProductFeedbackType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { ProductFeedbackService } from './product-feedback.service';
import { CreateProductFeedbackDto } from './dto/create-product-feedback.dto';
import { UpdateProductFeedbackStatusDto } from './dto/update-product-feedback-status.dto';

@Controller()
export class ProductFeedbackController {
  constructor(private readonly productFeedback: ProductFeedbackService) {}

  /** Envío desde admin de un restaurante. */
  @Post('api/restaurants/:restaurantId/feedback')
  @UseGuards(JwtAuthGuard)
  createForRestaurant(
    @VerifyRestaurantAccess('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProductFeedbackDto,
  ) {
    return this.productFeedback.create(restaurantId, user.userId, dto);
  }

  /** Envío sin restaurante (contexto de sesión / master / error global). */
  @Post('api/feedback')
  @UseGuards(JwtAuthGuard)
  createStandalone(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateProductFeedbackDto,
  ) {
    return this.productFeedback.create(null, user.userId, dto);
  }

  @Get('api/super-admin/feedback')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: ProductFeedbackStatus,
    @Query('type') type?: ProductFeedbackType,
    @Query('search') search?: string,
  ) {
    return this.productFeedback.listForMaster({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      type,
      search,
    });
  }

  @Patch('api/super-admin/feedback/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateProductFeedbackStatusDto,
  ) {
    return this.productFeedback.updateStatus(id, dto.status);
  }
}
