import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertAiBudgetDto {
  @IsString()
  scope: string;

  @IsOptional()
  @IsNumber()
  dailyLimitUsd?: number;

  @IsOptional()
  @IsNumber()
  monthlyLimitUsd?: number;

  @IsOptional()
  @IsBoolean()
  hardStop?: boolean;
}
