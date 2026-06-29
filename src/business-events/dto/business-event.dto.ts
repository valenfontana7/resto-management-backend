import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { BentooBusinessEventType } from '../types/event-type.enum';

export class QueryBusinessEventsDto {
  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @IsDateString()
  until?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(BentooBusinessEventType, { each: true })
  eventTypes?: BentooBusinessEventType[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  limit?: number;
}

export class ReplayBusinessEventsDto {
  @IsOptional()
  @IsDateString()
  since?: string;

  @IsOptional()
  @IsDateString()
  until?: string;

  @IsOptional()
  @IsArray()
  @IsEnum(BentooBusinessEventType, { each: true })
  eventTypes?: BentooBusinessEventType[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subscriberIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5000)
  limit?: number;
}
