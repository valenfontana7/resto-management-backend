import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateGrowthSettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoWinBackEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoWinBackIncludeCoupon?: boolean;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(30)
  winBackCouponPercent?: number;
}
