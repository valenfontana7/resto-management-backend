import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import {
  TrackOnboardingEventBatchDto,
  TrackOnboardingEventDto,
} from './dto/track-event.dto';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';

@ApiTags('Onboarding Analytics')
@Controller('api/public/onboarding-analytics')
export class OnboardingAnalyticsPublicController {
  constructor(private readonly service: OnboardingAnalyticsService) {}

  @Post('track')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({ summary: 'Track a single onboarding funnel event' })
  async track(@Body() dto: TrackOnboardingEventDto) {
    return this.service.track([dto]);
  }

  @Post('track-batch')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Track a batch of onboarding funnel events' })
  async trackBatch(@Body() dto: TrackOnboardingEventBatchDto) {
    return this.service.track(dto.events);
  }
}
