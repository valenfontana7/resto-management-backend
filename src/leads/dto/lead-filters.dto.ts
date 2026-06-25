import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { LeadStatus } from '@prisma/client';

export class LeadFiltersDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: LeadStatus })
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ enum: ['low', 'medium', 'high'] })
  @IsOptional()
  @IsIn(['low', 'medium', 'high'])
  priority?: 'low' | 'medium' | 'high';

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  maxScore?: number;

  @ApiPropertyOptional({
    enum: ['businessName', 'category', 'city', 'score', 'status', 'createdAt'],
  })
  @IsOptional()
  @IsIn(['businessName', 'category', 'city', 'score', 'status', 'createdAt'])
  sort?:
    | 'businessName'
    | 'category'
    | 'city'
    | 'score'
    | 'status'
    | 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  dir?: 'asc' | 'desc';

  @ApiPropertyOptional({ description: 'Solo leads descubiertos con IA' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  discoveredOnly?: boolean;
}
