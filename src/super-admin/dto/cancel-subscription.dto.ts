import { IsString, IsOptional } from 'class-validator';

export class CancelSubscriptionDto {
  @IsString()
  @IsOptional()
  reason?: string;
}
