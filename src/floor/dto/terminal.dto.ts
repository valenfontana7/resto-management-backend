import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateTerminalDto {
  @ApiProperty({ example: 'PC 1 · Mostrador' })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name: string;
}

export class UpdateTerminalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
