import { Module } from '@nestjs/common';
import { DeliveryController, TrackingController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [DeliveryController, TrackingController],
  providers: [DeliveryService],
  exports: [DeliveryService],
})
export class DeliveryModule {}
