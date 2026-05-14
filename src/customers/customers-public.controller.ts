import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CustomersService } from './customers.service';
import { ConsumeCustomerSessionDto } from './dto/consume-customer-session.dto';
import { RequestCustomerSessionDto } from './dto/request-customer-session.dto';
import { UpdateCustomerAccountDto } from './dto/update-customer-account.dto';

@Controller('api/public/restaurants/:restaurantId/customers')
export class CustomersPublicController {
  constructor(private readonly customersService: CustomersService) {}

  @Public()
  @Post('session/request')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  requestSession(
    @Param('restaurantId') restaurantId: string,
    @Body() body: RequestCustomerSessionDto,
  ) {
    return this.customersService.requestSession(restaurantId, body);
  }

  @Public()
  @Post('session/consume')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  consumeSession(
    @Param('restaurantId') restaurantId: string,
    @Body() body: ConsumeCustomerSessionDto,
  ) {
    return this.customersService.consumeSession(restaurantId, body.token);
  }

  @Public()
  @Get('session')
  getSession(
    @Param('restaurantId') restaurantId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.customersService.getSession(restaurantId, authorization);
  }

  @Public()
  @Get('me')
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
