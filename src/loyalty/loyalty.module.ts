import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { CustomersModule } from '../customers/customers.module';
import { PlansModule } from '../subscriptions/plans/plans.module';
import { BusinessEventsModule } from '../business-events/business-events.module';

@Module({
  imports: [CustomersModule, PlansModule, BusinessEventsModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
