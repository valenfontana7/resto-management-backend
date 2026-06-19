import { Module } from '@nestjs/common';
import { PlansController, PublicPlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { PlanEntitlementsService } from './plan-entitlements.service';
import { FeatureGuard } from '../guards/feature.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController, PublicPlansController],
  providers: [PlansService, PlanEntitlementsService, FeatureGuard],
  exports: [PlansService, PlanEntitlementsService, FeatureGuard],
})
export class PlansModule {}
