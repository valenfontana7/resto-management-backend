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

export class PingTerminalDto {
  @ApiPropertyOptional({ example: '0.2.1' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  clientVersion?: string;

  @ApiPropertyOptional({ example: '0.1.4' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  localVersion?: string;

  @ApiPropertyOptional({
    example: 'Microsoft Windows NT 6.1.7601 Service Pack 1',
  })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  platform?: string;
}
