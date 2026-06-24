import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';
import { BotDefenseDto } from '../../common/dto/bot-defense.dto';

export class RequestCustomerSessionDto extends BotDefenseDto {
  @ApiProperty({ example: 'cliente@ejemplo.com', required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ example: '+5491123456789', required: false })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: '/mi-restaurante/loyalty', required: false })
  @IsOptional()
  @IsString()
  redirect?: string;
}
