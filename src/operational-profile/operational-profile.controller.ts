import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Put,
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
import { OperationalProfileService } from './operational-profile.service';
import {
  CompleteOperationalProfileWizardDto,
  OperationalProfileWizardStepDto,
  ResetOperationalProfileDto,
  UpdateOperationalProfileDto,
} from './dto/operational-profile.dto';

@ApiTags('Operational Profile')
@Controller('api/restaurants/:id/operational-profile')
export class OperationalProfileController {
  constructor(
    private readonly operationalProfileService: OperationalProfileService,
  ) {}

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
      'Only OWNER or MANAGER can modify operational profile',
    );
  }

  @Get()
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get restaurant operational profile and UX projections',
  })
  @ApiParam({ name: 'id', description: 'Restaurant id' })
  async getProfile(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.operationalProfileService.getOrCreateProfile(
      restaurantId,
      user.userId,
    );
  }

  @Put()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update operational profile from settings' })
  @ApiParam({ name: 'id', description: 'Restaurant id' })
  async updateProfile(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: UpdateOperationalProfileDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertOwnerOrManager(user.role);
    return this.operationalProfileService.updateProfile(
      restaurantId,
      dto,
      user.userId,
    );
  }

  @Post('wizard')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Complete wizard step or full operational profile wizard',
  })
  @ApiParam({ name: 'id', description: 'Restaurant id' })
  async wizard(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body()
    body: CompleteOperationalProfileWizardDto & OperationalProfileWizardStepDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertOwnerOrManager(user.role);
    if (body.stepId && !body.operationalModel) {
      return this.operationalProfileService.recordWizardStep(
        restaurantId,
        body as OperationalProfileWizardStepDto,
        user.userId,
      );
    }

    return this.operationalProfileService.completeWizard(
      restaurantId,
      body as CompleteOperationalProfileWizardDto,
      user.userId,
    );
  }

  @Post('reset')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reset operational profile for manual reconfiguration',
  })
  @ApiParam({ name: 'id', description: 'Restaurant id' })
  async resetProfile(
    @VerifyRestaurantAccess('id') restaurantId: string,
    @Body() dto: ResetOperationalProfileDto,
    @CurrentUser() user: RequestUser,
  ) {
    this.assertOwnerOrManager(user.role);
    return this.operationalProfileService.resetProfile(
      restaurantId,
      dto,
      user.userId,
    );
  }
}
