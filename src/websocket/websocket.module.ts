import { Module } from '@nestjs/common';
import { OrdersGateway } from './orders.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [PrismaModule, CommonModule],
  providers: [OrdersGateway, WsJwtGuard],
  exports: [OrdersGateway],
})
export class WebsocketModule {}
