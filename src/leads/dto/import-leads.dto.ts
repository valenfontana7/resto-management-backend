import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateLeadDto } from './create-lead.dto';

export class ImportLeadsDto {
  @ApiProperty({ type: [CreateLeadDto] })
  @IsArray()
  @ArrayMaxSize(15)
  @ValidateNested({ each: true })
  @Type(() => CreateLeadDto)
  candidates: CreateLeadDto[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  autoAnalyze?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discoverySessionId?: string;

  @ApiPropertyOptional({ enum: ['off', 'suggest', 'auto'], default: 'suggest' })
  @IsOptional()
  @IsString()
  postProcessMode?: 'off' | 'suggest' | 'auto';
}
