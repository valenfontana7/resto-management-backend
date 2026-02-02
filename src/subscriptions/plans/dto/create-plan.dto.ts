import {
  IsString,
  IsInt,
  IsBoolean,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePlanRestrictionDto {
  @IsString()
  key: string;

  @IsString()
  type: string; // 'limit' | 'boolean' | 'text'

  @IsString()
  value: string;

  @IsString()
  displayName: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  category: string; // 'limits' | 'features' | 'integrations' | 'support'
}

export class CreatePlanDto {
  @IsString()
  id: string; // e.g., "STARTER", "PROFESSIONAL", "CUSTOM_1"

  @IsString()
  displayName: string;

  @IsString()
  description: string;

  @IsInt()
  @Min(0)
  price: number; // En centavos

  @IsString()
  interval: string; // 'monthly' | 'yearly'

  @IsInt()
  @Min(0)
  trialDays: number;

  @IsString()
  color: string; // Clase CSS de gradiente

  @IsInt()
  order: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePlanRestrictionDto)
  restrictions?: CreatePlanRestrictionDto[];
}
