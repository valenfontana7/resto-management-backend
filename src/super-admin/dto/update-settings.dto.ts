import {
  IsString,
  IsEmail,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class AdminAlertEventsDto {
  @IsBoolean()
  @IsOptional()
  userRegistered?: boolean;

  @IsBoolean()
  @IsOptional()
  restaurantCreated?: boolean;

  @IsBoolean()
  @IsOptional()
  userUpdated?: boolean;

  @IsBoolean()
  @IsOptional()
  restaurantStatusChanged?: boolean;

  @IsBoolean()
  @IsOptional()
  restaurantDeactivated?: boolean;

  @IsBoolean()
  @IsOptional()
  subscriptionUpdated?: boolean;

  @IsBoolean()
  @IsOptional()
  subscriptionPlanChanged?: boolean;

  @IsBoolean()
  @IsOptional()
  subscriptionCanceled?: boolean;

  @IsBoolean()
  @IsOptional()
  subscriptionReactivated?: boolean;

  @IsBoolean()
  @IsOptional()
  trialEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  trialDisabled?: boolean;

  @IsBoolean()
  @IsOptional()
  billingControlsUpdated?: boolean;
}

class NotificationsDto {
  @IsBoolean()
  @IsOptional()
  newRegistrations?: boolean;

  @IsBoolean()
  @IsOptional()
  paymentAlerts?: boolean;

  @IsBoolean()
  @IsOptional()
  dailySummary?: boolean;

  @ValidateNested()
  @Type(() => AdminAlertEventsDto)
  @IsOptional()
  adminEvents?: AdminAlertEventsDto;
}

class WebhooksDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  url?: string;
}

class MaintenanceDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsString()
  @IsOptional()
  message?: string;
}

export class UpdateSettingsDto {
  @IsString()
  @IsOptional()
  platformName?: string;

  @IsEmail()
  @IsOptional()
  supportEmail?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  sessionTimeout?: number;

  @ValidateNested()
  @Type(() => NotificationsDto)
  @IsOptional()
  notifications?: NotificationsDto;

  @ValidateNested()
  @Type(() => WebhooksDto)
  @IsOptional()
  webhooks?: WebhooksDto;

  @ValidateNested()
  @Type(() => MaintenanceDto)
  @IsOptional()
  maintenance?: MaintenanceDto;
}
