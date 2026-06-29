import { Module, forwardRef } from '@nestjs/common';
import { DeliveryController, TrackingController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { DeliveryZonesService } from './services/delivery-zones.service';
import { DeliveryDriversService } from './services/delivery-drivers.service';
import { DeliveryPricingService } from './services/delivery-pricing.service';
import { DeliveryDispatchService } from './services/delivery-dispatch.service';
import { GeocodeService } from './services/geocode.service';
import { DeliveryRunService } from './services/delivery-run.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessEventsModule } from '../business-events/business-events.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => NotificationsModule),
    BusinessEventsModule,
  ],
  controllers: [DeliveryController, TrackingController],
  providers: [
    DeliveryService,
    DeliveryZonesService,
    DeliveryDriversService,
    DeliveryPricingService,
    DeliveryDispatchService,
    GeocodeService,
    DeliveryRunService,
  ],
  exports: [
    DeliveryService,
    DeliveryZonesService,
    DeliveryDriversService,
    DeliveryPricingService,
    DeliveryDispatchService,
    GeocodeService,
    DeliveryRunService,
  ],
})
export class DeliveryModule {}
