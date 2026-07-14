import {
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
  IsOptional,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  ValidateNested,
  IsArray,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  ValidateIf,
  Allow,
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

/** Layout espacial opcional (plano sofisticado). */
export class TableLayoutDto {
  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(24)
  widthPct?: number;

  @IsOptional()
  @IsNumber()
  @Min(6)
  @Max(24)
  heightPct?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  rotationDeg?: number;

  /** null limpia el acento (teal por defecto). */
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  @Max(360)
  accentHue?: number | null;
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

  /** Etiqueta amigable (VIP, Ventana…). null/empty limpia. */
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(24)
  label?: string | null;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TableLayoutDto)
  layout?: TableLayoutDto;
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

  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(24)
  label?: string | null;

  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TableLayoutDto)
  layout?: TableLayoutDto;
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

export enum FloorStructureKind {
  WALL = 'wall',
  BLOCK = 'block',
}

/** Elemento estructural del plano (pared / bloque etiquetado). */
export class FloorStructureElementDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  id: string;

  @IsEnum(FloorStructureKind)
  kind: FloorStructureKind;

  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(24)
  label?: string | null;

  @IsNumber()
  @Min(0)
  @Max(100)
  x: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  y: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  widthPct: number;

  @IsNumber()
  @Min(1)
  @Max(100)
  heightPct: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(359)
  rotationDeg?: number;
}

export class CreateTableAreaDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  /** null limpia el tono del lienzo. */
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  @Max(360)
  canvasHue?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FloorStructureElementDto)
  structureElements?: FloorStructureElementDto[];
}

export class UpdateTableAreaDto {
  @IsOptional()
  @IsString()
  name?: string;

  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt()
  @Min(0)
  @Max(360)
  canvasHue?: number | null;

  /** null limpia estructuras; array reemplaza el set completo. */
  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FloorStructureElementDto)
  structureElements?: FloorStructureElementDto[] | null;
}

export class BulkCreateTableItemDto {
  @IsString()
  @IsNotEmpty()
  number: string;

  @IsInt()
  @Min(1)
  @Max(50)
  capacity: number;

  @IsOptional()
  @IsEnum(TableShape)
  shape?: TableShape;

  @Allow()
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsString()
  @MaxLength(24)
  label?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PositionDto)
  position?: PositionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TableLayoutDto)
  layout?: TableLayoutDto;
}

export class BulkCreateTablesDto {
  @IsString()
  @IsNotEmpty()
  areaId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkCreateTableItemDto)
  tables: BulkCreateTableItemDto[];

  @IsOptional()
  @IsBoolean()
  skipExisting?: boolean;
}

export class BulkDeleteTablesDto {
  @IsOptional()
  @IsString()
  areaId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tableIds?: string[];
}

export class BulkUpdateTablePositionItemDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;

  @ValidateNested()
  @Type(() => PositionDto)
  position: PositionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => TableLayoutDto)
  layout?: TableLayoutDto;
}

export class BulkUpdateTablePositionsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BulkUpdateTablePositionItemDto)
  positions: BulkUpdateTablePositionItemDto[];
}
