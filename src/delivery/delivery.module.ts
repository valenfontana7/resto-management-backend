import { Module } from '@nestjs/common';
import { DeliveryController, TrackingController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryZonesService } from './services/delivery-zones.service';
import { DeliveryDriversService } from './services/delivery-drivers.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DeliveryController, TrackingController],
  providers: [DeliveryService, DeliveryZonesService, DeliveryDriversService],
  exports: [DeliveryService, DeliveryZonesService, DeliveryDriversService],
})
export class DeliveryModule {}
