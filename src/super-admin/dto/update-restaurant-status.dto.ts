import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum RestaurantStatusAction {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  BANNED = 'BANNED', // Maps to INACTIVE or specific logic
}

export class UpdateRestaurantStatusDto {
  @IsEnum(RestaurantStatusAction)
  status: RestaurantStatusAction;

  @IsString()
  @IsOptional()
  reason?: string;
}
