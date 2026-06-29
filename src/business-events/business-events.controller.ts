import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { OwnershipService } from '../common/services/ownership.service';
import { BusinessEventReplayService } from './business-event-replay.service';
import { BusinessEventStoreService } from './business-event-store.service';
import {
  QueryBusinessEventsDto,
  ReplayBusinessEventsDto,
} from './dto/business-event.dto';
import { BENTOO_EVENT_REGISTRY } from './types/event-registry';

@Controller('api/restaurants/:restaurantId/business-events')
@UseGuards(JwtAuthGuard)
export class BusinessEventsController {
  constructor(
    private readonly store: BusinessEventStoreService,
    private readonly replay: BusinessEventReplayService,
    private readonly ownership: OwnershipService,
  ) {}

  @Get('registry')
  async getRegistry(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );
    return { events: Object.values(BENTOO_EVENT_REGISTRY) };
  }

  @Post('query')
  async query(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: QueryBusinessEventsDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );

    const events = await this.store.query(restaurantId, {
      since: dto.since ? new Date(dto.since) : undefined,
      until: dto.until ? new Date(dto.until) : undefined,
      eventTypes: dto.eventTypes,
      limit: dto.limit,
    });

    return {
      events: events.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      })),
      count: events.length,
    };
  }

  @Get('recent')
  async recent(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );

    const since = new Date();
    since.setHours(since.getHours() - 24);

    const parsedLimit = limit ? Number.parseInt(limit, 10) : 100;
    const events = await this.store.query(restaurantId, {
      since,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : 100,
    });

    return {
      events: events.map((event) => ({
        ...event,
        occurredAt: event.occurredAt.toISOString(),
      })),
      count: events.length,
    };
  }

  @Post('replay')
  async replayEvents(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReplayBusinessEventsDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(
      restaurantId,
      user.userId,
    );

    const result = await this.replay.replayForRestaurant(restaurantId, {
      since: dto.since ? new Date(dto.since) : undefined,
      until: dto.until ? new Date(dto.until) : undefined,
      eventTypes: dto.eventTypes,
      subscriberIds: dto.subscriberIds,
      limit: dto.limit,
    });

    return result;
  }
}
