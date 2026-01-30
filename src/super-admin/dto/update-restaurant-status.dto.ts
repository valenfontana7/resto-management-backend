import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum RestaurantStatusAction {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  BANNED = 'banned', // Maps to INACTIVE or specific logic
}

export class UpdateRestaurantStatusDto {
  @IsEnum(RestaurantStatusAction)
  status: RestaurantStatusAction;

  @IsString()
  @IsOptional()
  reason?: string;
}
