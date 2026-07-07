import { IsBoolean, IsOptional } from 'class-validator';

export class GenerateProspectPackageDto {
  /** Esperar a que termine la generación (sync). Default true en dev sin Redis. */
  @IsOptional()
  @IsBoolean()
  wait?: boolean;

  /** Importar automáticamente si el bundle pasa validación. */
  @IsOptional()
  @IsBoolean()
  autoImport?: boolean;
}
