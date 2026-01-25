import { IsString, IsOptional, IsDateString } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsString()
  planType: string;

  @IsDateString()
  @IsOptional()
  validUntil?: string;
}
