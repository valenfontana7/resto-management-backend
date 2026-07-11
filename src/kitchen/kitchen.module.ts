import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { KitchenController } from './kitchen.controller';
import { KitchenNotificationsService } from './kitchen-notifications.service';
import { KitchenStationsService } from './kitchen-stations.service';
import { OrdersModule } from '../orders/orders.module';
import { CommonModule } from '../common/common.module';
import { getJwtSecret } from '../common/config/jwt.config';

@Module({
  imports: [
    ConfigModule,
    CommonModule,
    JwtModule.register({
      secret: getJwtSecret(process.env.JWT_SECRET),
      signOptions: { expiresIn: '24h' },
    }),
    forwardRef(() => OrdersModule),
  ],
  controllers: [KitchenController],
  providers: [KitchenNotificationsService, KitchenStationsService],
  exports: [KitchenNotificationsService, KitchenStationsService],
})
export class KitchenModule {}
