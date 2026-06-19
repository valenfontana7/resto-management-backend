import {
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInventoryItemDto {
  @ApiProperty({ example: 'Carne vacuna' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'kg', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(0)
  currentStock: number;

  @ApiProperty({ example: 5 })
  @IsNumber()
  @Min(0)
  minStock: number;

  @ApiProperty({ example: ['dish-id-1'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedDishIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class UpdateInventoryItemDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  unit?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  currentStock?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  linkedDishIds?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
