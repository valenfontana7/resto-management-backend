import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class DiscoverLeadsDto {
  @ApiProperty({
    example: 'Pizzerías en Palermo sin sitio web propio',
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  query: string;

  @ApiPropertyOptional({ example: 'Buenos Aires' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'Pizzería' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ default: 10, maximum: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  maxResults?: number;
}
