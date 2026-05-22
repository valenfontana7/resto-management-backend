import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { CallMeBotService } from './callmebot.service';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { KitchenModule } from '../kitchen/kitchen.module';

@Module({
  imports: [PrismaModule, EmailModule, KitchenModule],
  controllers: [NotificationsController, PushNotificationsController],
  providers: [NotificationsService, PushNotificationService, CallMeBotService],
  exports: [NotificationsService, PushNotificationService, CallMeBotService],
})
export class NotificationsModule {}
