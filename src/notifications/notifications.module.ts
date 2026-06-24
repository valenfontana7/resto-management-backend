import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PushNotificationsController } from './push-notifications.controller';
import { PushNotificationService } from './push-notification.service';
import { CallMeBotModule } from './callmebot.module';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { KitchenModule } from '../kitchen/kitchen.module';
import { CommonModule } from '../common/common.module';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    KitchenModule,
    CallMeBotModule,
    CommonModule,
  ],
  controllers: [NotificationsController, PushNotificationsController],
  providers: [NotificationsService, PushNotificationService],
  exports: [NotificationsService, PushNotificationService, CallMeBotModule],
})
export class NotificationsModule {}
