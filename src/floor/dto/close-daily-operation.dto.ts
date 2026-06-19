import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class CloseDailyOperationDto {
  @ApiPropertyOptional({ description: 'Notas del cierre diario' })
  @IsOptional()
  @IsString()
  notes?: string;
}
