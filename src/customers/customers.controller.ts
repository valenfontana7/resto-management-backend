import { Body, Controller, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { CustomersService } from './customers.service';
import { UpsertCustomerProfileDto } from './dto/upsert-customer-profile.dto';

@Controller('api/restaurants/:restaurantId/customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Public()
  @Post('profile')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  upsertProfile(
    @Param('restaurantId') restaurantId: string,
    @Body() body: UpsertCustomerProfileDto,
  ) {
    return this.customersService.upsertProfile(restaurantId, body);
  }
}
