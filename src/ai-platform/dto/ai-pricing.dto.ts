import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { AiProvider } from '@prisma/client';

export class CreateAiPricingDto {
  @IsEnum(AiProvider)
  provider: AiProvider;

  @IsString()
  model: string;

  @IsNumber()
  inputPerMillion: number;

  @IsNumber()
  outputPerMillion: number;

  @IsOptional()
  @IsNumber()
  reasoningPerMillion?: number;

  @IsOptional()
  @IsString()
  currency?: string;
}

export class UpdateAiPricingDto {
  @IsOptional()
  @IsNumber()
  inputPerMillion?: number;

  @IsOptional()
  @IsNumber()
  outputPerMillion?: number;

  @IsOptional()
  @IsNumber()
  reasoningPerMillion?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
