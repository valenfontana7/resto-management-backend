import { Module } from '@nestjs/common';
import { ReservationsController } from './reservations.controller';
import { ReservationsPublicController } from './reservations-public.controller';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [ReservationsController, ReservationsPublicController],
  providers: [ReservationsService, PrismaService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
