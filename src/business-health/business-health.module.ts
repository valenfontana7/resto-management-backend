import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { EmailModule } from '../email/email.module';
import { BusinessHealthController } from './business-health.controller';
import { BusinessHealthService } from './business-health.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [CommonModule, EmailModule],
  controllers: [BusinessHealthController, InventoryController],
  providers: [BusinessHealthService, InventoryService],
  exports: [BusinessHealthService, InventoryService],
})
export class BusinessHealthModule {}
