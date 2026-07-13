import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Patch,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { VerifyRestaurantAccess } from '../common/decorators/verify-restaurant-access.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/decorators/current-user.decorator';
import { ExperienceService } from './experience.service';
import { PatchExperienceProfileDto } from './dto/experience.dto';

@ApiTags('Experience')
@Controller()
export class ExperienceController {
  constructor(private readonly experienceService: ExperienceService) {}

  private assertOwnerOrManager(role: string | undefined) {
    const normalized = (role ?? '').toUpperCase();
    if (
      normalized === 'OWNER' ||
      normalized === 'MANAGER' ||
      normalized === 'SUPER_ADMIN'
    ) {
      return;
    }
    throw new ForbiddenException(
      'Solo el dueño o el encargado pueden cambiar el modo de operación',
    );
  }

  @Get('api/experience/presets')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List operational experience presets' })
  listPresets() {
    return this.experienceService.listPresets();
  }

  @Get('api/restaurants/:id/experience')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get resolved experience definition for restaurant',
  })
  @ApiParam({ name: 'id', description: 'Restaurant id' })
  async getExperience(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.experienceService.getExperience(
      restaurantId,
      user.userId,
      user.role ?? 'OWNER',
    );
  }

  @Patch('api/restaurants/:id/experience/profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Override operational experience profile' })
  @ApiParam({ name: 'id', description: 'Restaurant id' })
  async patchProfile(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: PatchExperienceProfileDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertOwnerOrManager(user.role);
    return this.experienceService.patchExperienceProfile(
      restaurantId,
      dto,
      user.userId,
    );
  }
}
