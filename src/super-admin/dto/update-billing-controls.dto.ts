import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateBillingControlsDto {
  @IsBoolean()
  @IsOptional()
  isFreeAccount?: boolean;

  @IsInt()
  @Min(0)
  @Max(100)
  @IsOptional()
  discountPercentage?: number;

  @IsString()
  @IsOptional()
  discountReason?: string;
}
