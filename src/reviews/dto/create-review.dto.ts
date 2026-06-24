import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEmail,
  MaxLength,
} from 'class-validator';
import { BotDefenseDto } from '../../common/dto/bot-defense.dto';

export class CreateReviewDto extends BotDefenseDto {
  @IsString()
  @MaxLength(100)
  customerName: string;

  @IsOptional()
  @IsEmail()
  customerEmail?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsString()
  dishId?: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
