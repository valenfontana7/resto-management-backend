import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class EnrollLoyaltyDto {
  @IsEmail()
  email: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
