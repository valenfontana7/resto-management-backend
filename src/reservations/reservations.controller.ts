import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiTags,
  ApiOperation,
  ApiResponse,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import {
  CreateReservationDto,
  UpdateReservationDto,
  ReservationFiltersDto,
  ReservationStatus,
} from './dto/reservation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';

@ApiTags('reservations')
@Controller('api/restaurants/:restaurantId')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get('reservations')
  @ApiOperation({ summary: 'Get all reservations for a restaurant' })
  @ApiResponse({
    status: 200,
    description: 'Reservations retrieved successfully',
  })
  async findAll(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Query() filters: ReservationFiltersDto,
  ) {
    return this.reservationsService.findAll(restaurantId, user.userId, filters);
  }

  @Get('reservations/:id')
  @ApiOperation({ summary: 'Get reservation by ID' })
  @ApiResponse({
    status: 200,
    description: 'Reservation retrieved successfully',
  })
  async findOne(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reservationsService.findOne(id, restaurantId, user.userId);
  }

  @Patch('reservations/:id')
  @ApiOperation({ summary: 'Update reservation' })
  @ApiResponse({ status: 200, description: 'Reservation updated successfully' })
  async update(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() updateDto: UpdateReservationDto,
  ) {
    return this.reservationsService.update(
      id,
      restaurantId,
      user.userId,
      updateDto,
    );
  }

  @Patch('reservations/:id/status/:status')
  @ApiOperation({ summary: 'Update reservation status' })
  @ApiResponse({
    status: 200,
    description: 'Reservation status updated successfully',
  })
  async updateStatus(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @Param('status') status: ReservationStatus,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reservationsService.updateStatus(
      id,
      restaurantId,
      user.userId,
      status,
    );
  }

  @Delete('reservations/:id')
  @ApiOperation({ summary: 'Delete reservation' })
  @ApiResponse({
    status: 200,
    description: 'Reservation deleted successfully',
  })
  async delete(
    @Param('id') id: string,
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.reservationsService.delete(id, restaurantId, user.userId);
  }
}
