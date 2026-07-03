import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { RecordLeadDemoViewDto } from './dto/record-lead-demo-view.dto';
import { LeadDemoViewService } from './lead-demo-view.service';

@Public()
@Controller('api/public/leads')
export class PublicLeadsController {
  constructor(private readonly leadDemoViewService: LeadDemoViewService) {}

  @Post('demo-views')
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  recordDemoView(@Body() dto: RecordLeadDemoViewDto) {
    return this.leadDemoViewService.recordView(dto.slug);
  }
}
