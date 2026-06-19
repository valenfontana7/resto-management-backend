import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreateCashMovementDto,
  ManualCashMovementType,
} from './cash-register.dto';

export class OpenMainCashRegisterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  openingFloat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseMainCashRegisterDto {
  @IsInt()
  @Min(0)
  countedCash: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateMainCashMovementDto extends CreateCashMovementDto {}

export { ManualCashMovementType };
