import { Module } from '@nestjs/common';
import { DeliveryController, TrackingController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryZonesService } from './services/delivery-zones.service';
import { DeliveryDriversService } from './services/delivery-drivers.service';
import { DeliveryPricingService } from './services/delivery-pricing.service';
import { DeliveryDispatchService } from './services/delivery-dispatch.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DeliveryController, TrackingController],
  providers: [
    DeliveryService,
    DeliveryZonesService,
    DeliveryDriversService,
    DeliveryPricingService,
    DeliveryDispatchService,
  ],
  exports: [
    DeliveryService,
    DeliveryZonesService,
    DeliveryDriversService,
    DeliveryPricingService,
    DeliveryDispatchService,
  ],
})
export class DeliveryModule {}
