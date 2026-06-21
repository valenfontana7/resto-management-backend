import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  VerifyRestaurantAccess,
  VerifyRestaurantRole,
} from '../common/decorators/verify-restaurant-access.decorator';
import { EdgeSyncAuthGuard } from './edge-sync-auth.guard';
import {
  EdgeHeartbeatDto,
  EdgeRegisterDto,
  EdgeSyncPullQueryDto,
  EdgeSyncPushDto,
} from './dto/edge-sync.dto';
import { EdgeSyncService } from './edge-sync.service';

@ApiTags('edge-sync')
@Controller('api/restaurants/:restaurantId/edge')
export class EdgeSyncController {
  constructor(private readonly edgeSync: EdgeSyncService) {}

  @Post('register')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Register or rotate local edge server (owner)' })
  async register(
    @VerifyRestaurantRole({ paramName: 'restaurantId', role: 'OWNER' })
    restaurantId: string,
    @Body() dto: EdgeRegisterDto,
  ) {
    return this.edgeSync.registerLocalServer(restaurantId, dto);
  }

  @Public()
  @Post('heartbeat')
  @UseGuards(EdgeSyncAuthGuard)
  @ApiOperation({ summary: 'Local server heartbeat' })
  async heartbeat(
    @Param('restaurantId') restaurantId: string,
    @Req() req: { edgeLocal?: { localId: string } },
    @Body() dto: EdgeHeartbeatDto,
  ) {
    return this.edgeSync.heartbeat(restaurantId, req.edgeLocal!.localId, dto);
  }

  @Public()
  @Get('sync/pull')
  @UseGuards(EdgeSyncAuthGuard)
  @ApiOperation({ summary: 'Pull cloud deltas for local server' })
  async pull(
    @Param('restaurantId') restaurantId: string,
    @Req() req: { edgeLocal?: { localId: string } },
    @Query() query: EdgeSyncPullQueryDto,
  ) {
    return this.edgeSync.pull(
      restaurantId,
      req.edgeLocal!.localId,
      query.streams,
      query.since,
    );
  }

  @Public()
  @Post('sync/push')
  @UseGuards(EdgeSyncAuthGuard)
  @ApiOperation({ summary: 'Push local floor mutations to cloud' })
  async push(
    @Param('restaurantId') restaurantId: string,
    @Req() req: { edgeLocal?: { localId: string } },
    @Body() dto: EdgeSyncPushDto,
  ) {
    return this.edgeSync.push(restaurantId, req.edgeLocal!.localId, dto);
  }

  @Get('sync/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Edge sync status for admin' })
  async status(@VerifyRestaurantAccess('restaurantId') restaurantId: string) {
    return this.edgeSync.getStatus(restaurantId);
  }
}
