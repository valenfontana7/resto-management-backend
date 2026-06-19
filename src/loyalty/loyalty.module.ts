import { Module } from '@nestjs/common';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { CustomersModule } from '../customers/customers.module';
import { PlansModule } from '../subscriptions/plans/plans.module';

@Module({
  imports: [CustomersModule, PlansModule],
  controllers: [LoyaltyController],
  providers: [LoyaltyService],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}
