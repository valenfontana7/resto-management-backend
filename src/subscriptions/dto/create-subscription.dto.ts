import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export enum PlanType {
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export class CreateSubscriptionDto {
  @ApiProperty({
    enum: PlanType,
    example: PlanType.PROFESSIONAL,
    description: 'Tipo de plan a suscribir',
  })
  @IsEnum(PlanType)
  planType: PlanType;
}
