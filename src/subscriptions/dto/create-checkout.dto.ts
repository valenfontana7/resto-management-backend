import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl, IsOptional } from 'class-validator';
import { PlanType } from './create-subscription.dto';

export class CreateCheckoutDto {
  @ApiProperty({
    enum: PlanType,
    example: PlanType.PROFESSIONAL,
    description: 'Tipo de plan para el checkout',
  })
  @IsEnum(PlanType)
  planType: PlanType;

  @ApiProperty({
    example: 'https://app.restoo.com.ar/admin/subscription?success=true',
    description: 'URL de redirección en caso de éxito',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  successUrl?: string;

  @ApiProperty({
    example: 'https://app.restoo.com.ar/admin/subscription?canceled=true',
    description: 'URL de redirección en caso de cancelación',
    required: false,
  })
  @IsOptional()
  @IsUrl()
  cancelUrl?: string;
}
