import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { BotDefenseDto } from '../../common/dto/bot-defense.dto';

export class EnrollLoyaltyDto extends BotDefenseDto {
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
