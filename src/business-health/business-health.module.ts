import { Module, forwardRef } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { EmailModule } from '../email/email.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BusinessEventsModule } from '../business-events/business-events.module';
import { BusinessHealthController } from './business-health.controller';
import { BusinessHealthService } from './business-health.service';
import { BusinessHealthAlertsService } from './business-health-alerts.service';
import { BusinessHealthPdfService } from './business-health-pdf.service';
import { InventoryPdfService } from './inventory-pdf.service';
import { BusinessHealthSchedulerService } from './business-health-scheduler.service';
import { DishRecipeController } from './dish-recipe.controller';
import { DishRecipeService } from './dish-recipe.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryConsumptionService } from './inventory-consumption.service';

@Module({
  imports: [
    CommonModule,
    EmailModule,
    BusinessEventsModule,
    forwardRef(() => NotificationsModule),
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
    InventoryPdfService,
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
