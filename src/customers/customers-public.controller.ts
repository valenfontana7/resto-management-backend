import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { CustomersService } from './customers.service';
import { ConsumeCustomerSessionDto } from './dto/consume-customer-session.dto';
import { RequestCustomerSessionDto } from './dto/request-customer-session.dto';
import { UpdateCustomerAccountDto } from './dto/update-customer-account.dto';
import { BotDefenseService } from '../common/services/bot-defense.service';
import { PublicWriteAbuseService } from '../common/services/public-write-abuse.service';
import { AuthEmailAbuseService } from '../auth/services/auth-email-abuse.service';
import { getClientIp } from '../common/utils/client-ip.util';

@Controller('api/public/restaurants/:restaurantId/customers')
export class CustomersPublicController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly botDefense: BotDefenseService,
    private readonly publicWriteAbuse: PublicWriteAbuseService,
    private readonly authEmailAbuse: AuthEmailAbuseService,
  ) {}

  @Public()
  @Post('session/request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async requestSession(
    @Param('restaurantId') restaurantId: string,
    @Body() body: RequestCustomerSessionDto,
    @Req() req: Request,
  ) {
    if (this.botDefense.isHoneypotTriggered(body.companyWebsite)) {
      this.botDefense.logHoneypotHit('customers.session.request', {
        restaurantId,
      });
      await this.botDefense.applyBotDelayMs();
      return {
        sent: true,
        channel: 'email' as const,
        expiresInMinutes: 15,
      };
    }

    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'customer_session',
      restaurantId,
    });

    if (body.email?.trim()) {
      await this.authEmailAbuse.assertEmailDeliveryAllowed({
        ip: getClientIp(req),
        email: body.email,
        scope: 'customer_session',
      });
    }

    return this.customersService.requestSession(restaurantId, body);
  }

  @Public()
  @Post('session/consume')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async consumeSession(
    @Param('restaurantId') restaurantId: string,
    @Body() body: ConsumeCustomerSessionDto,
    @Req() req: Request,
  ) {
    await this.publicWriteAbuse.assertPublicWriteAllowed({
      ip: getClientIp(req),
      scope: 'token_lookup',
      restaurantId,
    });

    return this.customersService.consumeSession(restaurantId, body.token);
  }

  @Public()
  @Get('session')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  getSession(
    @Param('restaurantId') restaurantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.customersService.getSession(restaurantId, authorization);
  }

  @Public()
  @Get('me')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  getAccountOverview(
    @Param('restaurantId') restaurantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.customersService.getAccountOverview(
      restaurantId,
      authorization,
    );
  }

  @Public()
  @Patch('me')
  updateAccount(
    @Param('restaurantId') restaurantId: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateCustomerAccountDto,
  ) {
    return this.customersService.updateAccount(
      restaurantId,
      authorization,
      body,
    );
  }
}
