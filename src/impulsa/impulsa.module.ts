import { Module } from '@nestjs/common';
import { ImpulsaCheckoutService } from './impulsa-checkout.service';
import { ImpulsaPublicController } from './impulsa-public.controller';

@Module({
  controllers: [ImpulsaPublicController],
  providers: [ImpulsaCheckoutService],
})
export class ImpulsaModule {}
