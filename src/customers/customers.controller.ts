import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CustomersService } from './customers.service';
import { UpsertCustomerProfileDto } from './dto/upsert-customer-profile.dto';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';

@Controller('api/restaurants/:restaurantId/customers')
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
  ) {}

  @Public()
  @Post('profile')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async upsertProfile(
    @Param('restaurantId') restaurantId: string,
    @Body() body: UpsertCustomerProfileDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(body.companyWebsite)) {
      this.botDefense.logHoneypotHit('customers.profile.upsert', {
        restaurantId,
      });
      await this.botDefense.applyBotDelayMs();
      return { success: true };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'customer_profile',
      restaurantId,
    });

    return this.customersService.upsertProfile(restaurantId, body);
  }
}
