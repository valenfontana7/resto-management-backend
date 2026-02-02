import { Module } from '@nestjs/common';
import { PlansController, PublicPlansController } from './plans.controller';
import { PlansService } from './plans.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PlansController, PublicPlansController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
