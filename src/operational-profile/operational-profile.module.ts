import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EventSpineModule } from '../event-spine/event-spine.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { OperationalProfileController } from './operational-profile.controller';
import { OperationalProfileService } from './operational-profile.service';

@Module({
  imports: [PrismaModule, EventSpineModule, SubscriptionsModule],
  controllers: [OperationalProfileController],
  providers: [OperationalProfileService],
  exports: [OperationalProfileService],
})
export class OperationalProfileModule {}
