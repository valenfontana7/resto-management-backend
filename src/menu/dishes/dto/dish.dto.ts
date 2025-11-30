import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  MinLength,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDishDto {
  @ApiProperty({ example: 'Hamburguesa Completa' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: 'Carne de res, lechuga, tomate...', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 4200, description: 'Price in cents' })
  @IsInt()
  @Min(0)
  price: number;

  @ApiProperty({ example: 'clxxxx' })
  @IsString()
  categoryId: string;

  @ApiProperty({ example: 20, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  preparationTime?: number;

  @ApiProperty({ example: false, required: false, default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ example: ['Popular', 'Con papas'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ example: ['gluten'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];
}

export class UpdateDishDto {
  @ApiProperty({ example: 'Hamburguesa Premium', required: false })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiProperty({ example: 'Descripción actualizada', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 5200, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  price?: number;

  @ApiProperty({ example: 'clxxxx', required: false })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({ example: 25, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  preparationTime?: number;

  @ApiProperty({ example: false, required: false })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiProperty({ example: ['Nuevo tag'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiProperty({ example: ['lactosa'], required: false })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allergens?: string[];
}

export class ToggleAvailabilityDto {
  @ApiProperty({ example: false })
  @IsBoolean()
  isAvailable: boolean;
}
