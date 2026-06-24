import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminAlertsService } from './admin-alerts.service';

@Module({
  imports: [PrismaModule, EmailModule, NotificationsModule],
  providers: [AdminAlertsService],
  exports: [AdminAlertsService],
})
export class AdminAlertsModule {}
