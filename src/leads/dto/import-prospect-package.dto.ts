import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class ImportProspectPackageDto {
  /** Prospect bundle schema v1.0 (JSON completo). */
  @IsObject()
  bundle: Record<string, unknown>;

  /** Solo validar y mapear; no persiste ni actualiza el lead. */
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
