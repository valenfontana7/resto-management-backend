import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Req,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { Public } from '../auth/decorators/public.decorator';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';

/**
 * Controlador público para reservas (endpoints sin autenticación)
 */
@ApiTags('reservations-public')
@Controller()
@Public() // Marcar todo el controlador como público
export class ReservationsPublicController {
  constructor(
    private readonly reservationsService: ReservationsService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Post('api/restaurants/:restaurantId/reservations')
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({
    summary: 'Crear nueva reserva (público - no requiere autenticación)',
  })
  @ApiParam({ name: 'restaurantId', description: 'ID del restaurante' })
  @ApiResponse({
    status: 201,
    description: 'Reserva creada exitosamente',
    schema: {
      example: {
        reservation: {
          id: 'uuid-generado',
          restaurantId: 'rest-123',
          customer: {
            name: 'Juan Pérez',
            email: 'juan@example.com',
            phone: '+54 11 1234-5678',
          },
          date: '2026-01-15',
          time: '20:30',
          partySize: 4,
          tableId: null,
          status: 'pending',
          notes: 'Celebración de cumpleaños',
          createdAt: '2026-01-13T10:30:00Z',
          updatedAt: '2026-01-13T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Restaurante no encontrado' })
  @ApiResponse({ status: 422, description: 'Fecha/hora no disponible' })
  async createReservation(
    @Param('restaurantId') restaurantId: string,
    @Body() createDto: CreateReservationDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(createDto.companyWebsite)) {
      this.botDefense.logHoneypotHit('reservations.create', { restaurantId });
      await this.botDefense.applyBotDelayMs();
      return {
        reservation: this.reservationsService.buildDecoyPublicReservation(
          restaurantId,
          createDto,
        ),
      };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'reservation',
      restaurantId,
    });

    const reservation = await this.reservationsService.createPublic(
      restaurantId,
      createDto,
    );
    return { reservation };
  }

  @Get('api/reservations/:reservationId')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Obtener reserva por ID (público - no requiere autenticación)',
  })
  @ApiParam({ name: 'reservationId', description: 'ID de la reserva' })
  @ApiResponse({
    status: 200,
    description: 'Reserva encontrada',
    schema: {
      example: {
        reservation: {
          id: 'uuid-1',
          restaurantId: 'rest-123',
          customer: {
            name: 'Juan Pérez',
            email: 'juan@example.com',
            phone: '+54 11 1234-5678',
          },
          date: '2026-01-15',
          time: '20:30',
          partySize: 4,
          tableId: null,
          status: 'pending',
          notes: 'Celebración de cumpleaños',
          createdAt: '2026-01-13T10:30:00Z',
          updatedAt: '2026-01-13T10:30:00Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Reserva no encontrada' })
  async getReservation(
    @Param('reservationId') reservationId: string,
    @Query('token') token?: string,
    @Req() req?: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req as Request),
      scope: 'token_lookup',
    });

    const reservation = await this.reservationsService.findOnePublic(
      reservationId,
      token,
    );
    return { reservation };
  }
}
