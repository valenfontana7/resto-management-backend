import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  IsEnum,
  ValidateNested,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shared DTO definitions for restaurant business information.
 */

// ==================== Business Info ====================

export class BusinessInfoDto {
  @ApiPropertyOptional({ example: 'La Parrilla' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'restaurant' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'A cozy Argentinian steakhouse' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['Argentinian', 'Steakhouse'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cuisineTypes?: string[];

  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: 'https://example.com/cover.jpg' })
  @IsOptional()
  @IsString()
  coverImage?: string;
}

// ==================== Contact Info ====================

export class ContactInfoDto {
  @ApiPropertyOptional({ example: 'Av. Corrientes 1234' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+54 11 1234-5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'info@laparrilla.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Buenos Aires' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Argentina' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'C1043' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'https://laparrilla.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: '-34.6037' })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: '-58.3816' })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

// ==================== Business Hours ====================

export class DayHoursDto {
  @ApiPropertyOptional({ example: '09:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Open time must be in HH:MM format',
  })
  open?: string;

  @ApiPropertyOptional({ example: '22:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Close time must be in HH:MM format',
  })
  close?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;
}

export class BusinessHoursDto {
  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  monday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  tuesday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  wednesday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  thursday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  friday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  saturday?: DayHoursDto;

  @ApiPropertyOptional({ type: DayHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DayHoursDto)
  sunday?: DayHoursDto;
}

// ==================== Business Rules ====================

export class OrderRulesDto {
  @ApiPropertyOptional({
    example: 1000,
    description: 'Minimum order amount in cents',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Order lead time in minutes',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  orderLeadTime?: number;

  @ApiPropertyOptional({
    example: 100,
    description: 'Maximum concurrent orders',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxConcurrentOrders?: number;
}

export class DeliveryRulesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  baseFee?: number;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  freeDeliveryThreshold?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  maxRadius?: number;

  @ApiPropertyOptional({ example: 45 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedTime?: number;
}

export class ReservationRulesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxPartySize?: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minAdvanceBookingHours?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAdvanceBookingDays?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  @Min(15)
  timeSlotInterval?: number;
}

export class PaymentRulesDto {
  @ApiPropertyOptional({
    example: ['cash', 'debit-card', 'credit-card'],
    enum: [
      'cash',
      'debit-card',
      'credit-card',
      'bank-transfer',
      'digital-wallet',
    ],
  })
  @IsOptional()
  @IsEnum(
    ['cash', 'debit-card', 'credit-card', 'bank-transfer', 'digital-wallet'],
    { each: true },
  )
  acceptedMethods?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  requirePaymentForReservation?: boolean;
}

export class BusinessRulesDto {
  @ApiPropertyOptional({ type: OrderRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderRulesDto)
  orders?: OrderRulesDto;

  @ApiPropertyOptional({ type: DeliveryRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryRulesDto)
  delivery?: DeliveryRulesDto;

  @ApiPropertyOptional({ type: ReservationRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReservationRulesDto)
  reservations?: ReservationRulesDto;

  @ApiPropertyOptional({ type: PaymentRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentRulesDto)
  payments?: PaymentRulesDto;
}

// ==================== Features ====================

export class FeaturesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onlineOrdering?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  tableReservations?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  delivery?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  takeaway?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  dineIn?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  paymentOnline?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  paymentCash?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  paymentCard?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  menuVisible?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showPrices?: boolean;
}
