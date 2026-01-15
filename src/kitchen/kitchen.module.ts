import { Module } from '@nestjs/common';
import { KitchenController } from './kitchen.controller';

@Module({
  controllers: [KitchenController],
})
export class KitchenModule {}
