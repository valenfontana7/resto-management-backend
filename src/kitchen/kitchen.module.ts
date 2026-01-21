import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { KitchenController } from './kitchen.controller';
import { KitchenNotificationsService } from './kitchen-notifications.service';

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fallback-secret',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [KitchenController],
  providers: [KitchenNotificationsService],
  exports: [KitchenNotificationsService],
})
export class KitchenModule {}
