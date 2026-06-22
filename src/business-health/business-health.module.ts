import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessHealthController } from './business-health.controller';
import { BusinessHealthService } from './business-health.service';
import { BusinessHealthAlertsService } from './business-health-alerts.service';
import { BusinessHealthPdfService } from './business-health-pdf.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [CommonModule, EmailModule, NotificationsModule],
  controllers: [BusinessHealthController, InventoryController],
  providers: [
    BusinessHealthService,
    BusinessHealthAlertsService,
    BusinessHealthPdfService,
    InventoryService,
  ],
  exports: [BusinessHealthService, InventoryService],
})
export class BusinessHealthModule {}
