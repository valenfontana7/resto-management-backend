import { Module } from '@nestjs/common';
import { CouponsController } from './coupons.controller';
import { PublicCouponsController } from './public-coupons.controller';
import { CouponsService } from './coupons.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  controllers: [CouponsController, PublicCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
