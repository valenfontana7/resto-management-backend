import { Module } from '@nestjs/common';
import { OrdersGateway } from './orders.gateway';
import { WsJwtGuard } from './ws-jwt.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [OrdersGateway, WsJwtGuard],
  exports: [OrdersGateway],
})
export class WebsocketModule {}
