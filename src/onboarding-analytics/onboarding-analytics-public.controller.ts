import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';
import {
  TrackOnboardingEventBatchDto,
  TrackOnboardingEventDto,
} from './dto/track-event.dto';
import { OnboardingAnalyticsService } from './onboarding-analytics.service';

@ApiTags('Onboarding Analytics')
@Controller('api/public/onboarding-analytics')
export class OnboardingAnalyticsPublicController {
  constructor(
    private readonly service: OnboardingAnalyticsService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Post('track')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @ApiOperation({ summary: 'Track a single onboarding funnel event' })
  async track(@Body() dto: TrackOnboardingEventDto, @Req() req: Request) {
    if (this.botDefense.isHoneypotTriggered(dto.companyWebsite)) {
      this.botDefense.logHoneypotHit('onboarding-analytics.track', {
        ip: getClientIp(req),
      });
      await this.botDefense.applyBotDelayMs();
      return { accepted: true };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
    });

    return this.service.track([dto]);
  }

  @Post('track-batch')
  @Public()
  @HttpCode(202)
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @ApiOperation({ summary: 'Track a batch of onboarding funnel events' })
  async trackBatch(
    @Body() dto: TrackOnboardingEventBatchDto,
    @Req() req: Request,
  ) {
    const honeypotHit = dto.events.some((event) =>
      this.botDefense.isHoneypotTriggered(event.companyWebsite),
    );
    if (honeypotHit) {
      this.botDefense.logHoneypotHit('onboarding-analytics.track-batch', {
        ip: getClientIp(req),
      });
      await this.botDefense.applyBotDelayMs();
      return { accepted: true, count: dto.events.length };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'public_read',
    });

    return this.service.track(dto.events);
  }
}
