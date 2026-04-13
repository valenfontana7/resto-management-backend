import { Controller, Post, Body, Param } from '@nestjs/common';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/coupon.dto';

@Controller('api/public/restaurants/:restaurantId/coupons')
export class PublicCouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Post('validate')
  async validate(
    @Param('restaurantId') restaurantId: string,
    @Body() validateDto: ValidateCouponDto,
  ) {
    const result = await this.couponsService.validate(
      restaurantId,
      validateDto,
    );
    // Strip full coupon object from public response
    return {
      valid: result.valid,
      discountAmount: result.discountAmount,
      message: result.message,
    };
  }
}
