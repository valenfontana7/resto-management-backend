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
import { ExperimentsService } from './experiments.service';
import { CreateExperimentDto, UpdateExperimentDto } from './dto/experiment.dto';

@Controller('api/restaurants/:restaurantId/experiments')
@UseGuards(JwtAuthGuard)
export class ExperimentsController {
  constructor(
    private readonly experimentsService: ExperimentsService,
    private readonly ownershipService: OwnershipService,
  ) {}

  @Get()
  async list(@Param('restaurantId') restaurantId: string, @Req() req: any) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.experimentsService.list(restaurantId);
  }

  @Post()
  async create(
    @Param('restaurantId') restaurantId: string,
    @Body() dto: CreateExperimentDto,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.experimentsService.create(restaurantId, dto);
  }

  @Get(':id')
  async getById(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.experimentsService.getById(restaurantId, id);
  }

  @Patch(':id')
  async update(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateExperimentDto,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.experimentsService.update(restaurantId, id, dto);
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
    return this.experimentsService.delete(restaurantId, id);
  }

  @Get(':id/results')
  async results(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    await this.ownershipService.verifyUserOwnsRestaurant(
      restaurantId,
      req.user.userId,
    );
    return this.experimentsService.getResults(restaurantId, id);
  }

  @Post(':id/assign')
  async assign(
    @Param('restaurantId') restaurantId: string,
    @Param('id') id: string,
    @Body('visitorId') visitorId: string,
  ) {
    return this.experimentsService.assignVariant(restaurantId, id, visitorId);
  }

  @Post('track-conversion')
  async trackConversion(
    @Body('variantId') variantId: string,
    @Body('revenue') revenue?: number,
  ) {
    return this.experimentsService.recordConversion(variantId, revenue);
  }
}
