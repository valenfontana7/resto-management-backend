import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { CallMeBotModule } from '../notifications/callmebot.module';
import { AdminAlertsService } from './admin-alerts.service';

@Module({
  imports: [PrismaModule, EmailModule, CallMeBotModule],
  providers: [AdminAlertsService],
  exports: [AdminAlertsService],
})
export class AdminAlertsModule {}
