import {
  IsArray,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ProductFeedbackPriority, ProductFeedbackType } from '@prisma/client';

export class CreateProductFeedbackDto {
  @IsEnum(ProductFeedbackType)
  type: ProductFeedbackType;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  category?: string;

  @IsOptional()
  @IsEnum(ProductFeedbackPriority)
  priority?: ProductFeedbackPriority;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  integrationPlatform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  useCase?: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  screenshotCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  screenshotLabels?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  clientSubmissionId?: string;

  @IsOptional()
  @IsISO8601()
  submittedAt?: string;
}
