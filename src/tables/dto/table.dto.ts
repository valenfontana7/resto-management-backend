import {
  IsString,
  IsInt,
  Min,
  Max,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  RESERVED = 'RESERVED',
  CLEANING = 'CLEANING',
}

export enum TableShape {
  SQUARE = 'SQUARE',
  ROUND = 'ROUND',
  RECTANGLE = 'RECTANGLE',
}

export class PositionDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  x: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y: number;
}

export class CreateTableDto {
  @IsString()
  @IsNotEmpty()
  number: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsOptional()
  @IsEnum(TableShape)
  shape?: TableShape;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}

export class UpdateTableDto {
  @IsOptional()
  @IsString()
  number?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @IsOptional()
  @IsEnum(TableShape)
  shape?: TableShape;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;
}

export class UpdateTableStatusDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  reservationId?: string;

  @IsOptional()
  @IsString()
  waiter?: string;

  @IsOptional()
  @IsString()
  customerName?: string;
}

export class CreateTableAreaDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class UpdateTableAreaDto {
  @IsOptional()
  @IsString()
  name?: string;
}
