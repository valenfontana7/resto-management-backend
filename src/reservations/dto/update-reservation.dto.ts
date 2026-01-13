import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  Matches,
  IsDateString,
} from 'class-validator';
import { ReservationStatus } from '@prisma/client';

export class UpdateReservationDto {
  @ApiPropertyOptional({ example: '2026-01-16' })
  @IsOptional()
  @IsDateString({}, { message: 'Formato de fecha inválido, use YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ example: '21:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Formato de hora inválido, use HH:mm',
  })
  time?: string;

  @ApiPropertyOptional({ example: 6, minimum: 1, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  partySize?: number;

  @ApiPropertyOptional({ example: 'table-10' })
  @IsOptional()
  @IsString()
  tableId?: string;

  @ApiPropertyOptional({
    enum: ReservationStatus,
    example: ReservationStatus.CONFIRMED,
  })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ example: 'Mesa junto a la ventana' })
  @IsOptional()
  @IsString()
  notes?: string;
}
