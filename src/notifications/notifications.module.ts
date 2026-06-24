import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { CallMeBotModule } from './callmebot.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { KitchenModule } from '../kitchen/kitchen.module';

@Module({
  imports: [PrismaModule, EmailModule, KitchenModule, CallMeBotModule],
  controllers: [NotificationsController, PushNotificationsController],
  providers: [NotificationsService, PushNotificationService],
  exports: [NotificationsService, PushNotificationService, CallMeBotModule],
})
export class NotificationsModule {}
