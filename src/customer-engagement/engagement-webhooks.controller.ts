import {
  Controller,
  Post,
  Req,
  Headers,
  HttpCode,
  ForbiddenException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ResendEngagementWebhookService } from './services/resend-engagement-webhook.service';

@ApiTags('webhooks')
@Controller('api/webhooks/resend')
export class EngagementWebhooksController {
  constructor(private readonly resendWebhook: ResendEngagementWebhookService) {}

  @Post('engagement')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Resend webhooks → outcomes CS (opened/clicked)',
  })
  async handleResendEngagement(
    @Req() req: { rawBody?: Buffer },
    @Headers() headers: Record<string, string | undefined>,
  ) {
    const rawBody = req.rawBody?.toString('utf8') ?? '';
    const result = await this.resendWebhook.handleEvent(rawBody, headers);

    if (!result.received && result.reason?.includes('not configured')) {
      throw new ForbiddenException(result.reason);
    }

    if (!result.received) {
      throw new ForbiddenException(result.reason ?? 'Invalid webhook');
    }

    return result;
  }
}
