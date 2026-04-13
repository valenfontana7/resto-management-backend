import { IsEmail, IsEnum, IsOptional, IsBoolean } from 'class-validator';

export enum DigestFrequency {
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
}

export class CreateDigestPreferenceDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(DigestFrequency)
  frequency?: DigestFrequency;
}

export class UpdateDigestPreferenceDto {
  @IsOptional()
  @IsEnum(DigestFrequency)
  frequency?: DigestFrequency;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
