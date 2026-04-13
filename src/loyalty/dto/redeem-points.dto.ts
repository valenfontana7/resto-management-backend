import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsEmail,
  MaxLength,
} from 'class-validator';

export class RedeemPointsDto {
  @IsString()
  @IsEmail()
  customerEmail: string;

  @IsInt()
  @Min(1)
  points: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  orderId?: string;
}
