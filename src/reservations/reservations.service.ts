import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateReservationDto,
  UpdateReservationDto,
  ReservationFiltersDto,
  ReservationStatus,
} from './dto/reservation.dto';

@Injectable()
export class ReservationsService {
  constructor(private prisma: PrismaService) {}

  async create(
    restaurantId: string,
    userId: string,
    createDto: CreateReservationDto,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const reservationData: any = {
      restaurantId,
      customerName: createDto.customerName,
      customerEmail: createDto.customerEmail,
      customerPhone: createDto.customerPhone,
      date: new Date(createDto.date),
      time: createDto.time,
      partySize: createDto.partySize,
      notes: createDto.notes,
      status: ReservationStatus.PENDING,
    };

    if (createDto.tableId) {
      reservationData.tableId = createDto.tableId;
    }

    return this.prisma.reservation.create({
      data: reservationData,
      include: {
        table: true,
      },
    });
  }

  async findAll(
    restaurantId: string,
    userId: string,
    filters: ReservationFiltersDto,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const where: any = {
      restaurantId,
    };

    if (filters.date) {
      const date = new Date(filters.date);
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      where.date = {
        gte: date,
        lt: nextDay,
      };
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const reservations = await this.prisma.reservation.findMany({
      where,
      include: {
        table: true,
      },
      orderBy: [{ date: 'asc' }, { time: 'asc' }],
    });

    return {
      reservations,
      count: reservations.length,
    };
  }

  async findOne(id: string, restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        restaurantId,
      },
      include: {
        table: true,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    return reservation;
  }

  async update(
    id: string,
    restaurantId: string,
    userId: string,
    updateDto: UpdateReservationDto,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    const updateData: any = {};

    if (updateDto.customerName)
      updateData.customerName = updateDto.customerName;
    if (updateDto.customerEmail)
      updateData.customerEmail = updateDto.customerEmail;
    if (updateDto.customerPhone)
      updateData.customerPhone = updateDto.customerPhone;
    if (updateDto.date) updateData.date = new Date(updateDto.date);
    if (updateDto.time) updateData.time = updateDto.time;
    if (updateDto.partySize) updateData.partySize = updateDto.partySize;
    if (updateDto.tableId !== undefined) updateData.tableId = updateDto.tableId;
    if (updateDto.status) updateData.status = updateDto.status;
    if (updateDto.notes !== undefined) updateData.notes = updateDto.notes;

    return this.prisma.reservation.update({
      where: { id },
      data: updateData,
      include: {
        table: true,
      },
    });
  }

  async delete(id: string, restaurantId: string, userId: string) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    await this.prisma.reservation.delete({
      where: { id },
    });

    return { message: 'Reservation deleted successfully' };
  }

  async updateStatus(
    id: string,
    restaurantId: string,
    userId: string,
    status: ReservationStatus,
  ) {
    await this.verifyRestaurantOwnership(restaurantId, userId);

    const reservation = await this.prisma.reservation.findFirst({
      where: {
        id,
        restaurantId,
      },
    });

    if (!reservation) {
      throw new NotFoundException(`Reservation with ID ${id} not found`);
    }

    return this.prisma.reservation.update({
      where: { id },
      data: { status },
      include: {
        table: true,
      },
    });
  }

  private async verifyRestaurantOwnership(
    restaurantId: string,
    userId: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.restaurantId !== restaurantId) {
      throw new ForbiddenException('You do not have access to this restaurant');
    }
  }
}
