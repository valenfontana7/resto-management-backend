import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSavedSearchDto {
  @ApiProperty({ example: 'Pizzerías sin web en Palermo' })
  @IsString()
  @MinLength(3)
  query: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  filters?: {
    city?: string;
    category?: string;
    maxResults?: number;
  };

  @ApiPropertyOptional({
    enum: ['manual', 'daily', 'weekly'],
    default: 'manual',
  })
  @IsOptional()
  @IsIn(['manual', 'daily', 'weekly'])
  schedule?: 'manual' | 'daily' | 'weekly';

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateSavedSearchDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  query?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  filters?: {
    city?: string;
    category?: string;
    maxResults?: number;
  };

  @ApiPropertyOptional({ enum: ['manual', 'daily', 'weekly'] })
  @IsOptional()
  @IsIn(['manual', 'daily', 'weekly'])
  schedule?: 'manual' | 'daily' | 'weekly';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
