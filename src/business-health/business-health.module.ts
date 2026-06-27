import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from '../common/common.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessHealthController } from './business-health.controller';
import { BusinessHealthService } from './business-health.service';
import { BusinessHealthAlertsService } from './business-health-alerts.service';
import { BusinessHealthPdfService } from './business-health-pdf.service';
import { BusinessHealthSchedulerService } from './business-health-scheduler.service';
import { DishRecipeController } from './dish-recipe.controller';
import { DishRecipeService } from './dish-recipe.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryConsumptionService } from './inventory-consumption.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    CommonModule,
    EmailModule,
    NotificationsModule,
  ],
  controllers: [
    BusinessHealthController,
    InventoryController,
    DishRecipeController,
  ],
  providers: [
    BusinessHealthService,
    BusinessHealthAlertsService,
    BusinessHealthPdfService,
    BusinessHealthSchedulerService,
    InventoryService,
    InventoryConsumptionService,
    DishRecipeService,
  ],
  exports: [
    BusinessHealthService,
    InventoryService,
    InventoryConsumptionService,
  ],
})
export class BusinessHealthModule {}
