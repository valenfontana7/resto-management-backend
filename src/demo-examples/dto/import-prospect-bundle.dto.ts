import { IsBoolean, IsObject, IsOptional, IsString } from 'class-validator';

export class ImportProspectBundleDto {
  /** Prospect bundle schema v1.0 (JSON completo). */
  @IsObject()
  bundle: Record<string, unknown>;

  /** Solo validar y mapear; no persiste. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  /** Si se indica, vincula el slug importado al lead comercial. */
  @IsOptional()
  @IsString()
  leadId?: string;
}
