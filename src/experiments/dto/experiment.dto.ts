import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsDateString,
  IsObject,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ExperimentType {
  PRICE = 'PRICE',
  MENU_LAYOUT = 'MENU_LAYOUT',
  DISH_DESCRIPTION = 'DISH_DESCRIPTION',
  DISH_IMAGE = 'DISH_IMAGE',
}

export class CreateVariantDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsBoolean()
  isControl?: boolean;

  @IsObject()
  config: Record<string, any>;
}

export class CreateExperimentDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(ExperimentType)
  type: ExperimentType;

  @IsOptional()
  @IsString()
  targetEntity?: string;

  @IsOptional()
  @IsString()
  targetEntityId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  trafficSplit?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}

export class UpdateExperimentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  trafficSplit?: number;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
