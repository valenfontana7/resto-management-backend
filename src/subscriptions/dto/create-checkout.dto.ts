import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUrl, IsOptional, IsString } from 'class-validator';
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
    example: 'https://app.bentoo.com.ar/admin/subscription?success=true',
    description: 'URL de redirección en caso de éxito',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  successUrl?: string;

  @ApiProperty({
    example: 'https://app.bentoo.com.ar/admin/subscription?canceled=true',
    description: 'URL de redirección en caso de cancelación',
    required: false,
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  cancelUrl?: string;

  @ApiProperty({
    example: 'mercadopago',
    description: 'Proveedor de pago a utilizar (mercadopago o payway)',
    required: false,
    default: 'mercadopago',
  })
  @IsOptional()
  @IsString()
  paymentProvider?: 'mercadopago' | 'payway';
}
