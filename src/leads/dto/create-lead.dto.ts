import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateLeadDto {
  @ApiProperty({ example: 'Pizzería La Nonna' })
  @IsString()
  @MinLength(1)
  businessName: string;

  @ApiPropertyOptional({ example: 'Pizzería' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'María García' })
  @IsOptional()
  @IsString()
  contactName?: string;

  @ApiPropertyOptional({ example: 'maria@lanonna.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+54 11 1234-5678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '+54 9 11 1234-5678' })
  @IsOptional()
  @IsString()
  whatsapp?: string;

  @ApiPropertyOptional({ example: '@lanonna_pizza' })
  @IsOptional()
  @IsString()
  instagram?: string;

  @ApiPropertyOptional({ example: 'https://lanonna.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({ example: 'Buenos Aires' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasWebsite?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasOnlineMenu?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasReservations?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasWhatsapp?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  hasEcommerce?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  branchCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  discoveredWithAi?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discoverySessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discoverySourceUrl?: string;
}
