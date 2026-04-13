import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Req,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnershipService } from '../common/services/ownership.service';
import { DigestPreferencesService } from './digest-preferences.service';
import {
  CreateDigestPreferenceDto,
  UpdateDigestPreferenceDto,
} from './dto/digest.dto';

@Controller('api/restaurants/:restaurantId/digest')
@UseGuards(JwtAuthGuard)
export class DigestController {
  constructor(
    private readonly preferencesService: DigestPreferencesService,
    private readonly ownershipService: OwnershipService,
  ) {}

  @Get()
  async list(@Param('restaurantId') restaurantId: string, @Req() req: any) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.preferencesService.list(restaurantId);
  }

  @Post()
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateDigestPreferenceDto,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.preferencesService.create(restaurantId, dto);
  }

  @Patch(':id')
  async update(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateDigestPreferenceDto,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.preferencesService.update(restaurantId, id, dto);
  }

  @Delete(':id')
  async delete(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.preferencesService.delete(restaurantId, id);
  }
}
