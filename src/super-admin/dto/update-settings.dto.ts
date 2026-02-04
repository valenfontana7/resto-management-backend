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
