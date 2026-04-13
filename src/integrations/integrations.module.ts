import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OwnershipService } from '../common/services/ownership.service';
import { DeliveryPlatformsService } from './services/delivery-platforms.service';
import { ExternalOrdersService } from './services/external-orders.service';
import { DeliveryPlatformsController } from './delivery-platforms.controller';
import { ExternalOrdersController } from './external-orders.controller';

@Module({
  controllers: [DeliveryPlatformsController, ExternalOrdersController],
  providers: [
    DeliveryPlatformsService,
    ExternalOrdersService,
    PrismaService,
    OwnershipService,
  ],
  exports: [DeliveryPlatformsService, ExternalOrdersService],
})
export class IntegrationsModule {}
