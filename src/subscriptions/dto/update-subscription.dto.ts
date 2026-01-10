import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { PlanType } from './create-subscription.dto';

export class UpdateSubscriptionDto {
  @ApiProperty({
    enum: PlanType,
    example: PlanType.ENTERPRISE,
    description: 'Nuevo tipo de plan',
  })
  @IsEnum(PlanType)
  planType: PlanType;
}
