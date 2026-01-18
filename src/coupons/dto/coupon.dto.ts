import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  IsBoolean,
  IsDateString,
  IsArray,
  IsUUID,
  ValidateIf,
  IsPositive,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum CouponType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export class CreateCouponDto {
  @ApiProperty({ example: 'DESCUENTO20' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Descuento especial' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Descuento por primera compra' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: CouponType, example: CouponType.PERCENTAGE })
  @IsEnum(CouponType)
  type: CouponType;

  @ApiProperty({ example: 20 })
  @IsNumber()
  @IsPositive()
  value: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @ValidateIf((o) => o.type === CouponType.PERCENTAGE)
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @IsDateString()
  validFrom: string;

  @ApiProperty({ example: '2024-12-31T23:59:59.000Z' })
  @IsDateString()
  validUntil: string;

  @ApiPropertyOptional({ example: ['product-id-1', 'product-id-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicableProducts?: string[];

  @ApiPropertyOptional({ example: ['category-id-1'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicableCategories?: string[];
}

export class UpdateCouponDto {
  @ApiPropertyOptional({ example: 'DESCUENTO25' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({ example: 'Descuento especial actualizado' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Descuento por primera compra actualizado' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: CouponType, example: CouponType.PERCENTAGE })
  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  value?: number;

  @ApiPropertyOptional({ example: 1000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrderAmount?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @ValidateIf((o) => o.type === CouponType.PERCENTAGE)
  @IsNumber()
  @Min(0)
  maxDiscountAmount?: number;

  @ApiPropertyOptional({ example: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  usageLimit?: number;

  @ApiPropertyOptional({ example: '2024-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional({ example: '2024-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: ['product-id-1', 'product-id-2'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicableProducts?: string[];

  @ApiPropertyOptional({ example: ['category-id-1'] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  applicableCategories?: string[];
}

export class CouponFiltersDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'DESCUENTO' })
  @IsOptional()
  @IsString()
  code?: string;
}

export class ValidateCouponDto {
  @ApiProperty({ example: 'DESCUENTO20' })
  @IsString()
  code: string;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  @IsPositive()
  orderAmount: number;

  @ApiPropertyOptional({ example: 'customer-id' })
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional({
    example: [
      {
        productId: 'product-id',
        categoryId: 'category-id',
        quantity: 2,
        price: 750,
      },
    ],
  })
  @IsOptional()
  @IsArray()
  items?: Array<{
    productId: string;
    categoryId?: string;
    quantity: number;
    price: number;
  }>;
}

export class CouponStatsDto {
  @ApiPropertyOptional({
    enum: ['day', 'week', 'month', 'year'],
    example: 'month',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month', 'year'])
  period?: 'day' | 'week' | 'month' | 'year';
}
