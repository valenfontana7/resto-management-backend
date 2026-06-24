import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsObject,
  IsOptional,
  IsString,
  Length,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BotDefenseDto } from '../../common/dto/bot-defense.dto';

const EVENT_MAX = 64;
const SESSION_MAX = 64;

export class TrackOnboardingEventDto extends BotDefenseDto {
  @IsString()
  @Length(1, SESSION_MAX)
  sessionId!: string;

  @IsString()
  @Length(1, EVENT_MAX)
  event!: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  userId?: string;

  @IsOptional()
  @IsString()
  @Length(1, 64)
  restaurantId?: string;

  @IsOptional()
  @IsObject()
  props?: Record<string, unknown>;
}

export class TrackOnboardingEventBatchDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => TrackOnboardingEventDto)
  events!: TrackOnboardingEventDto[];
}
