import { Module } from '@nestjs/common';
import { PlansController, PublicPlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { PlanEntitlementsService } from './plan-entitlements.service';
import { FeatureGuard } from '../guards/feature.guard';
import { SubscriptionResolverService } from '../subscription-resolver.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { CommonModule } from '../../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [PlansController, PublicPlansController],
  providers: [
    PlansService,
    PlanEntitlementsService,
    FeatureGuard,
    SubscriptionResolverService,
  ],
  exports: [
    PlansService,
    PlanEntitlementsService,
    FeatureGuard,
    SubscriptionResolverService,
  ],
})
export class PlansModule {}
