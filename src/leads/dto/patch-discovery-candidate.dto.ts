import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import type { LeadDiscoveryConfidence } from '../types/lead-discovery.types';

export class PatchDiscoveryCandidateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  instagram?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  whatsapp?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  hasWebsite?: boolean;

  @IsOptional()
  @IsBoolean()
  hasOnlineMenu?: boolean;

  @IsOptional()
  @IsBoolean()
  hasReservations?: boolean;

  @IsOptional()
  @IsBoolean()
  hasWhatsapp?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  whyFit?: string;

  @IsOptional()
  @IsIn(['high', 'medium', 'low'])
  confidence?: LeadDiscoveryConfidence;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  sourceUrl?: string;
}
