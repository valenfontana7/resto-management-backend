import { IsBoolean, IsOptional } from 'class-validator';

export class RunProspectPipelineDto {
  @IsOptional()
  @IsBoolean()
  skipImport?: boolean;

  @IsOptional()
  @IsBoolean()
  skipImages?: boolean;

  @IsOptional()
  @IsBoolean()
  skipSalesPackage?: boolean;
}
