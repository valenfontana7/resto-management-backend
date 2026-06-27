import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class DishRecipeLineInputDto {
  @ApiProperty()
  @IsString()
  inventoryItemId: string;

  @ApiProperty({ example: 0.25 })
  @IsNumber()
  @Min(0.0001)
  quantity: number;
}

export class UpsertDishRecipeDto {
  @ApiProperty({ type: [DishRecipeLineInputDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => DishRecipeLineInputDto)
  lines: DishRecipeLineInputDto[];

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  syncCostToDish?: boolean;
}
