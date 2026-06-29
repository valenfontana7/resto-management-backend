import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { CustomersService } from '../customers/customers.service';
import {
  CreateReservationDto as CreateReservationDtoOld,
  UpdateReservationDto,
  ReservationFiltersDto,
  ReservationStatus,
} from './dto/reservation.dto';
import { CreateReservationDto as CreateReservationDtoPublic } from './dto/create-reservation.dto';
import { BusinessEventPublisherService } from '../business-events/business-event-publisher.service';
import { BentooBusinessEventType } from '../business-events/types/event-type.enum';

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
    private readonly businessEvents: BusinessEventPublisherService,
    @Optional() private readonly customersService?: CustomersService,
  ) {}

  /**
   * Crear reserva (público - no requiere autenticación)
   */
  async createPublic(
    restaurantId: string,
    createDto: CreateReservationDtoPublic,
  ) {
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

    const customerProfile = await this.customersService?.upsertProfile(
      restaurantId,
      {
        email: createDto.customer.email,
        phone: createDto.customer.phone,
        name: createDto.customer.name,
      },
    );

    const publicAccessToken = crypto.randomBytes(32).toString('base64url');

    const reservation = await this.prisma.reservation.create({
      data: {
        restaurantId,
        customerProfileId: customerProfile?.id,
        customerName: createDto.customer.name,
        customerEmail: createDto.customer.email || '',
        customerPhone: createDto.customer.phone,
        date: new Date(createDto.date),
        time: createDto.time,
        partySize: createDto.partySize,
        notes: createDto.notes || null,
        status: ReservationStatus.PENDING,
        tableId: null, // Las reservas públicas no especifican mesa
        publicAccessToken,
      },
    });

    this.logger.log(
      `Reserva creada: ${reservation.id} para ${createDto.customer.name} en ${restaurant.name}`,
    );

    return {
      ...this.formatReservation(reservation),
      publicAccessToken,
    };
  }

  buildDecoyPublicReservation(
    restaurantId: string,
    createDto: CreateReservationDtoPublic,
  ) {
    const now = new Date();
    return {
      id: `decoy-${now.getTime()}`,
      restaurantId,
      customer: {
        name: createDto.customer.name,
        email: createDto.customer.email || null,
        phone: createDto.customer.phone,
      },
      date: createDto.date,
      time: createDto.time,
      partySize: createDto.partySize,
      tableId: null,
      status: 'pending',
      notes: createDto.notes || null,
      createdAt: now,
      updatedAt: now,
      publicAccessToken: crypto.randomBytes(32).toString('base64url'),
    };
  }

  async create(
    restaurantId: string,
    userId: string,
    createDto: CreateReservationDtoOld,
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

    if (filters.startDate || filters.endDate) {
      where.date = {};

      if (filters.startDate) {
        where.date.gte = new Date(filters.startDate);
      }

      if (filters.endDate) {
        where.date.lte = new Date(filters.endDate);
      }
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
      ...(filters.limit ? { take: filters.limit } : {}),
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

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: updateData,
      include: {
        table: true,
      },
    });

    if (
      updateDto.status &&
      (updateDto.status as string) !== (reservation.status as string)
    ) {
      void this.publishReservationStatusEvent(
        restaurantId,
        updated,
        updateDto.status,
      );
    }

    return updated;
  }

  private publishReservationStatusEvent(
    restaurantId: string,
    reservation: {
      id: string;
      customerName: string;
      date: Date;
      time: string;
      partySize: number;
    },
    status: ReservationStatus,
  ): void {
    const payloadBase = {
      reservationId: reservation.id,
      customerName: reservation.customerName,
      date: reservation.date.toISOString().slice(0, 10),
      time: reservation.time,
      partySize: reservation.partySize,
    };

    if (status === ReservationStatus.CONFIRMED) {
      void this.businessEvents
        .publish({
          eventType: BentooBusinessEventType.ReservationConfirmed,
          restaurantId,
          source: 'reservations.service',
          payload: payloadBase,
          correlationId: reservation.id,
        })
        .catch((error) => {
          this.logger.warn(
            `Failed to publish ReservationConfirmed for ${reservation.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
      return;
    }

    if (status === ReservationStatus.NO_SHOW) {
      void this.businessEvents
        .publish({
          eventType: BentooBusinessEventType.ReservationNoShow,
          restaurantId,
          source: 'reservations.service',
          payload: payloadBase,
          correlationId: reservation.id,
        })
        .catch((error) => {
          this.logger.warn(
            `Failed to publish ReservationNoShow for ${reservation.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }
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
   * Obtener una reserva por ID (público — requiere token si la reserva lo tiene)
   */
  async findOnePublic(id: string, token?: string) {
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

    const normalizedToken = (token ?? '').trim();
    if (
      !reservation.publicAccessToken ||
      !normalizedToken ||
      reservation.publicAccessToken !== normalizedToken
    ) {
      throw new UnauthorizedException('Token de acceso inválido');
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
