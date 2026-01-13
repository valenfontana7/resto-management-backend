import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import {
  CreateReservationDto,
  UpdateReservationDto,
  ReservationFiltersDto,
  ReservationStatus,
} from './dto/reservation.dto';

/**
 * Servicio para gestión de reservaciones.
 * Refactorizado para usar OwnershipService centralizado (DRY + SOLID).
 */
@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ownership: OwnershipService,
  ) {}

  /**
   * Crear reserva (público - no requiere autenticación)
   */
  async createPublic(restaurantId: string, createDto: CreateReservationDto) {
    // Verificar que el restaurante existe
    const restaurant = await this.prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true },
    });

    if (!restaurant) {
      throw new NotFoundException('Restaurante no encontrado');
    }

    // Validar que la fecha no sea anterior a hoy
    const reservationDate = new Date(
      createDto.date + 'T' + createDto.time + ':00',
    );
    const now = new Date();
    if (reservationDate < now) {
      throw new BadRequestException(
        'La fecha y hora de la reserva no puede ser anterior al momento actual',
      );
    }

    const reservation = await this.prisma.reservation.create({
      data: {
        restaurantId,
        customerName: createDto.customer.name,
        customerEmail: createDto.customer.email || '',
        customerPhone: createDto.customer.phone,
        date: new Date(createDto.date),
        time: createDto.time,
        partySize: createDto.partySize,
        notes: createDto.notes || null,
        status: ReservationStatus.PENDING,
        tableId: createDto.tableId || null,
      },
    });

    this.logger.log(
      `Reserva creada: ${reservation.id} para ${createDto.customer.name} en ${restaurant.name}`,
    );

    return this.formatReservation(reservation);
  }

  async create(
    restaurantId: string,
    userId: string,
    createDto: CreateReservationDto,
  ) {
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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
    await this.ownership.verifyUserBelongsToRestaurant(restaurantId, userId);

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

  /**
   * Obtener una reserva por ID (público - no requiere autenticación)
   */
  async findOnePublic(id: string) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
          },
        },
        table: {
          select: {
            id: true,
            number: true,
            capacity: true,
          },
        },
      },
    });

    if (!reservation) {
      throw new NotFoundException('Reserva no encontrada');
    }

    return this.formatReservation(reservation);
  }

  /**
   * Formatear la respuesta de la reserva
   */
  private formatReservation(reservation: any) {
    return {
      id: reservation.id,
      restaurantId: reservation.restaurantId,
      customer: {
        name: reservation.customerName,
        email: reservation.customerEmail || null,
        phone: reservation.customerPhone,
      },
      date: reservation.date.toISOString().split('T')[0], // YYYY-MM-DD
      time: reservation.time,
      partySize: reservation.partySize,
      tableId: reservation.tableId || null,
      table: reservation.table || null,
      status: reservation.status.toLowerCase(),
      notes: reservation.notes || null,
      specialRequests: reservation.specialRequests || null,
      restaurant: reservation.restaurant || undefined,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };
  }
}
