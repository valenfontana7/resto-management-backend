import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import { BriefingFeedbackService } from './briefing-feedback.service';
import { RecordBriefingFeedbackDto } from './dto/briefing-feedback.dto';

@Controller('api/restaurants/:restaurantId/briefing-feedback')
@UseGuards(JwtAuthGuard)
export class BriefingFeedbackController {
  constructor(private readonly briefingFeedback: BriefingFeedbackService) {}

  @Get()
  getActive(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.briefingFeedback.getActive(restaurantId, user.userId);
  }

  @Post()
  record(
    @Param('restaurantId') restaurantId: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: RecordBriefingFeedbackDto,
  ) {
    return this.briefingFeedback.record(restaurantId, user.userId, dto);
  }

  @Delete(':preparationId')
  remove(
    @Param('restaurantId') restaurantId: string,
    @Param('preparationId') preparationId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.briefingFeedback.remove(
      restaurantId,
      user.userId,
      decodeURIComponent(preparationId),
    );
  }
}
