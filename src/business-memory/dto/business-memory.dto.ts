import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BusinessMemoryCategory, BusinessMemoryStatus } from '@prisma/client';

export class UpsertBusinessMemoryDto {
  @IsString()
  memoryKey: string;

  @IsEnum(BusinessMemoryCategory)
  category: BusinessMemoryCategory;

  @IsString()
  title: string;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsString()
  sourceProvider?: string;

  @IsOptional()
  @IsString()
  sourceInsightId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class QueryBusinessMemoryDto {
  @IsOptional()
  @IsEnum(BusinessMemoryStatus)
  status?: BusinessMemoryStatus;

  @IsOptional()
  @IsEnum(BusinessMemoryCategory)
  category?: BusinessMemoryCategory;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  memoryKeys?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  sinceDays?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

export class SyncInsightMemoriesDto {
  @IsArray()
  insights: SyncInsightMemoryItemDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providerIds?: string[];
}

export class SyncInsightMemoryItemDto {
  @IsString()
  id: string;

  @IsString()
  title: string;

  @IsString()
  message: string;

  @IsString()
  category: string;

  @IsString()
  providerId: string;
}

export class ResolveBusinessMemoryByKeysDto {
  @IsArray()
  @IsString({ each: true })
  memoryKeys: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  providerIds?: string[];
}
