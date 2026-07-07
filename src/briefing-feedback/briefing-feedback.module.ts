import { Module } from '@nestjs/common';
import { CommonModule } from '../common/common.module';
import { BriefingFeedbackController } from './briefing-feedback.controller';
import { BriefingFeedbackService } from './briefing-feedback.service';

@Module({
  imports: [CommonModule],
  controllers: [BriefingFeedbackController],
  providers: [BriefingFeedbackService],
  exports: [BriefingFeedbackService],
})
export class BriefingFeedbackModule {}
