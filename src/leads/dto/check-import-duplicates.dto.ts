import { Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CheckImportDuplicateItemDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty()
  @IsString()
  businessName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;
}

export class CheckImportDuplicatesDto {
  @ApiProperty({ type: [CheckImportDuplicateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CheckImportDuplicateItemDto)
  candidates: CheckImportDuplicateItemDto[];
}
