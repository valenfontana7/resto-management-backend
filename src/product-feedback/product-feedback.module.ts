import { Module } from '@nestjs/common';
import { AdminAlertsModule } from '../admin-alerts/admin-alerts.module';
import { ProductFeedbackController } from './product-feedback.controller';
import { ProductFeedbackService } from './product-feedback.service';

@Module({
  imports: [AdminAlertsModule],
  controllers: [ProductFeedbackController],
  providers: [ProductFeedbackService],
  exports: [ProductFeedbackService],
})
export class ProductFeedbackModule {}
