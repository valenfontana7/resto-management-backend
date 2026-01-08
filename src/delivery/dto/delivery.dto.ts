import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsArray,
  IsEmail,
  IsNumber,
  Min,
  Max,
  IsDateString,
  IsNotEmpty,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ============================================
// DELIVERY ZONES
// ============================================

export class CreateDeliveryZoneDto {
  @ApiProperty({ example: 'Centro' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 50000, description: 'Fee en centavos' })
  @IsInt()
  @Min(0)
  deliveryFee: number;

  @ApiProperty({ example: 300000, description: 'Monto mínimo en centavos' })
  @IsInt()
  @Min(0)
  minOrder: number;

  @ApiPropertyOptional({ example: '30-45 min' })
  @IsString()
  @IsOptional()
  estimatedTime?: string;

  @ApiProperty({ example: ['Retiro', 'San Nicolás', 'Monserrat'] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  areas: string[];
}

export class UpdateDeliveryZoneDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  deliveryFee?: number;

  @ApiPropertyOptional()
  @IsInt()
  @Min(0)
  @IsOptional()
  minOrder?: number;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  estimatedTime?: string;

  @ApiPropertyOptional()
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  areas?: string[];

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

// ============================================
// DELIVERY DRIVERS
// ============================================

export class CreateDeliveryDriverDto {
  @ApiProperty({ example: 'Juan Repartidor' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: '+54 9 11 5555-5555' })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ example: 'juan@delivery.com' })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'Moto',
    enum: ['Moto', 'Auto', 'Bicicleta', 'Otro'],
  })
  @IsString()
  @IsOptional()
  vehicle?: string;

  @ApiPropertyOptional({ example: 'ABC123' })
  @IsString()
  @IsOptional()
  licensePlate?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

export class UpdateDeliveryDriverDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  vehicle?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  licensePlate?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}

// ============================================
// DELIVERY ORDERS
// ============================================

export enum DeliveryStatus {
  READY = 'READY',
  ASSIGNED = 'ASSIGNED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export class AssignDriverDto {
  @ApiProperty({ example: 'clxxx123' })
  @IsString()
  @IsNotEmpty()
  driverId: string;
}

export class UpdateDeliveryStatusDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  status: DeliveryStatus;

  @ApiPropertyOptional({ example: 'Pedido retirado a las 18:40' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: -34.603722 })
  @IsNumber()
  @IsOptional()
  lat?: number;

  @ApiPropertyOptional({ example: -58.381592 })
  @IsNumber()
  @IsOptional()
  lng?: number;
}

export class DeliveryOrderFiltersDto {
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  @IsOptional()
  status?: DeliveryStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  driverId?: string;

  @ApiPropertyOptional({ example: '2025-11-30' })
  @IsDateString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  @Type(() => Number)
  limit?: number = 20;
}

export class DeliveryStatsFiltersDto {
  @ApiPropertyOptional({ enum: ['today', 'week', 'month', 'custom'] })
  @IsEnum(['today', 'week', 'month', 'custom'])
  @IsOptional()
  period?: 'today' | 'week' | 'month' | 'custom' = 'today';

  @ApiPropertyOptional({ example: '2025-11-01' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-11-30' })
  @IsDateString()
  @IsOptional()
  endDate?: string;
}

// ============================================
// DRIVER LOCATION
// ============================================

export class UpdateDriverLocationDto {
  @ApiProperty({ example: -34.603722 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat: number;

  @ApiProperty({ example: -58.381592 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng: number;

  @ApiPropertyOptional({
    example: 180,
    description: 'Dirección en grados (0-360)',
  })
  @IsInt()
  @Min(0)
  @Max(360)
  @IsOptional()
  heading?: number;

  @ApiPropertyOptional({ example: 25.5, description: 'Velocidad en km/h' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  speed?: number;
}

// ============================================
// DRIVER STATS FILTERS
// ============================================

export class DriverStatsFiltersDto {
  @ApiPropertyOptional({ enum: ['today', 'week', 'month'] })
  @IsEnum(['today', 'week', 'month'])
  @IsOptional()
  period?: 'today' | 'week' | 'month' = 'today';
}

// ============================================
// DRIVER AVAILABILITY FILTERS
// ============================================

export class DriverFiltersDto {
  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isAvailable?: boolean;
}
