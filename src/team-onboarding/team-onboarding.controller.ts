import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  RestaurantIdParam,
  RestaurantOwnerGuard,
} from '../common/guards/restaurant-owner.guard';
import { TeamInviteService } from './team-invite.service';
import {
  CreateTeamInviteDto,
  RedeemTeamInviteDto,
} from './team-onboarding.dto';

@ApiTags('team-onboarding')
@ApiBearerAuth()
@Controller('api/restaurants/:restaurantId/team')
export class TeamOnboardingController {
  constructor(private readonly teamInvites: TeamInviteService) {}

  @Post('invites')
  @UseGuards(JwtAuthGuard, RestaurantOwnerGuard)
  @RestaurantIdParam('restaurantId')
  @ApiOperation({ summary: 'Generar invitación PIN/QR para el equipo' })
  createInvite(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateTeamInviteDto,
  ) {
    return this.teamInvites.createInvite(restaurantId, user.userId, dto);
  }

  @Get('invites')
  @UseGuards(JwtAuthGuard, RestaurantOwnerGuard)
  @RestaurantIdParam('restaurantId')
  @ApiOperation({ summary: 'Listar invitaciones activas' })
  listInvites(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.teamInvites.listActiveInvites(restaurantId, user.userId);
  }

  @Post('invites/redeem')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Canjear invitación con PIN' })
  redeemInvite(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RedeemTeamInviteDto,
  ) {
    return this.teamInvites.redeemInvite({
      inviteId: dto.inviteId,
      pin: dto.pin,
      userId: user.userId,
      restaurantId,
    });
  }
}
