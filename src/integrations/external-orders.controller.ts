import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  Headers,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnershipService } from '../common/services/ownership.service';
import { ExternalOrdersService } from './services/external-orders.service';

@Controller('api')
export class ExternalOrdersController {
  constructor(
    private readonly externalOrdersService: ExternalOrdersService,
    private readonly ownership: OwnershipService,
  ) {}

  /**
   * Webhook endpoint — no auth, validated by X-Webhook-Secret header
   */
  @Post('webhooks/delivery-platform')
  async receiveWebhook(
    @Headers('x-webhook-secret') secret: string,
    @Body() payload: any,
  ) {
    return this.externalOrdersService.receiveWebhook(secret, payload);
  }

  /**
   * List external orders (admin)
   */
  @Get('restaurants/:restaurantId/integrations/external-orders')
  @UseGuards(JwtAuthGuard)
  async list(
    @Param('restaurantId') restaurantId: string,
    @Query('status') status: string,
    @Query('platformId') platformId: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.externalOrdersService.list(restaurantId, {
      status,
      platformId,
    });
  }

  /**
   * Get single external order detail
   */
  @Get('restaurants/:restaurantId/integrations/external-orders/:orderId')
  @UseGuards(JwtAuthGuard)
  async getById(
    @Param('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.externalOrdersService.getById(restaurantId, orderId);
  }

  /**
   * Accept an external order → creates internal Order
   */
  @Post(
    'restaurants/:restaurantId/integrations/external-orders/:orderId/accept',
  )
  @UseGuards(JwtAuthGuard)
  async accept(
    @Param('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.externalOrdersService.accept(restaurantId, orderId);
  }

  /**
   * Reject an external order
   */
  @Post(
    'restaurants/:restaurantId/integrations/external-orders/:orderId/reject',
  )
  @UseGuards(JwtAuthGuard)
  async reject(
    @Param('restaurantId') restaurantId: string,
    @Param('orderId') orderId: string,
    @Body('reason') reason: string,
    @Request() req,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.externalOrdersService.reject(restaurantId, orderId, reason);
  }
}
