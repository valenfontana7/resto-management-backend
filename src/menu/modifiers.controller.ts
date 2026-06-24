import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ModifiersService } from './modifiers.service';
import {
  CreateModifierGroupDto,
  UpdateModifierGroupDto,
  CreateModifierDto,
  UpdateModifierDto,
} from './dto/modifier.dto';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';

@Controller('restaurants/:restaurantId/dishes/:dishId/modifiers')
export class ModifiersController {
  constructor(
    private readonly modifiersService: ModifiersService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  /** Public: get modifier groups for a dish */
  @Public()
  @Get()
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  async getGroups(
    @Param('restaurantId') restaurantId: string,
    @Param('dishId') dishId: string,
    @Req() req: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
      restaurantId,
    });
    return this.modifiersService.getGroupsByDish(dishId);
  }

  /** Admin: create modifier group */
  @UseGuards(JwtAuthGuard)
  @Post()
  createGroup(
    @Param('dishId') dishId: string,
    @Body() dto: CreateModifierGroupDto,
  ) {
    return this.modifiersService.createGroup(dishId, dto);
  }

  /** Admin: update modifier group */
  @UseGuards(JwtAuthGuard)
  @Patch(':groupId')
  updateGroup(
    @Param('groupId') groupId: string,
    @Body() dto: UpdateModifierGroupDto,
  ) {
    return this.modifiersService.updateGroup(groupId, dto);
  }

  /** Admin: delete modifier group */
  @UseGuards(JwtAuthGuard)
  @Delete(':groupId')
  deleteGroup(@Param('groupId') groupId: string) {
    return this.modifiersService.deleteGroup(groupId);
  }

  /** Admin: add modifier to group */
  @UseGuards(JwtAuthGuard)
  @Post(':groupId/options')
  addModifier(
    @Param('groupId') groupId: string,
    @Body() dto: CreateModifierDto,
  ) {
    return this.modifiersService.addModifier(groupId, dto);
  }

  /** Admin: update modifier */
  @UseGuards(JwtAuthGuard)
  @Patch(':groupId/options/:modifierId')
  updateModifier(
    @Param('modifierId') modifierId: string,
    @Body() dto: UpdateModifierDto,
  ) {
    return this.modifiersService.updateModifier(modifierId, dto);
  }

  /** Admin: delete modifier */
  @UseGuards(JwtAuthGuard)
  @Delete(':groupId/options/:modifierId')
  deleteModifier(@Param('modifierId') modifierId: string) {
    return this.modifiersService.deleteModifier(modifierId);
  }
}
