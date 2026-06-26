import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { FiscalDocumentType } from '@prisma/client';

export class IssueOrderFiscalDocumentDto {
  @IsEnum(FiscalDocumentType)
  type!: FiscalDocumentType;

  @IsOptional()
  @IsString()
  customerDocType?: string;

  @IsOptional()
  @IsString()
  customerDocNumber?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  customerIvaCondition?: number;
}
