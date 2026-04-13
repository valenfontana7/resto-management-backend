import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsObject,
} from 'class-validator';

export enum PlatformType {
  PEDIDOS_YA = 'PEDIDOS_YA',
  RAPPI = 'RAPPI',
  UBER_EATS = 'UBER_EATS',
  CUSTOM = 'CUSTOM',
}

export class CreatePlatformDto {
  @IsEnum(PlatformType)
  platform: PlatformType;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class UpdatePlatformDto {
  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsString()
  apiSecret?: string;

  @IsOptional()
  @IsString()
  storeId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class ExternalOrderItemDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  quantity: number;
  unitPrice: number;
  subtotal: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
