import { IsString, IsOptional, IsInt, Min, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClientMutationIdDto } from './client-mutation-id.dto';

export class OpenCashRegisterDto extends ClientMutationIdDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  openingFloat?: number;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CloseCashRegisterDto extends ClientMutationIdDto {
  @IsInt()
  @Min(0)
  countedCash: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Efectivo a depositar en caja mayor al cerrar',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  depositToMain?: number;
}

export enum ManualCashMovementType {
  WITHDRAWAL = 'WITHDRAWAL',
  DEPOSIT = 'DEPOSIT',
  ADJUSTMENT = 'ADJUSTMENT',
}

export class CreateCashMovementDto {
  @IsEnum(ManualCashMovementType)
  type: ManualCashMovementType;

  @IsInt()
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
