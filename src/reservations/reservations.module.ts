import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { CommonModule } from '../common/common.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsPublicController } from './reservations-public.controller';
import { ReservationsService } from './reservations.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [CustomersModule, CommonModule, BusinessEventsModule],
  controllers: [ReservationsController, ReservationsPublicController],
  providers: [ReservationsService, PrismaService],
  exports: [ReservationsService],
})
export class ReservationsModule {}
