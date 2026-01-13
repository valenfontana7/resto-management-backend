import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEmail,
  IsOptional,
  IsInt,
  Min,
  Max,
  MinLength,
  Matches,
  ValidateNested,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

class CustomerDto {
  @ApiProperty({ example: 'Juan Pérez', minLength: 3 })
  @IsString()
  @MinLength(3, { message: 'El nombre debe tener al menos 3 caracteres' })
  name: string;

  @ApiPropertyOptional({ example: 'juan@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Formato de email inválido' })
  email?: string;

  @ApiProperty({ example: '+54 11 1234-5678', minLength: 10 })
  @IsString()
  @MinLength(10, { message: 'El teléfono debe tener al menos 10 caracteres' })
  phone: string;
}

export class CreateReservationDto {
  @ApiProperty({ type: CustomerDto })
  @ValidateNested()
  @Type(() => CustomerDto)
  customer: CustomerDto;

  @ApiProperty({
    example: '2026-01-15',
    description: 'Fecha en formato YYYY-MM-DD',
  })
  @IsDateString({}, { message: 'Formato de fecha inválido, use YYYY-MM-DD' })
  date: string;

  @ApiProperty({ example: '20:30', description: 'Hora en formato HH:mm' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Formato de hora inválido, use HH:mm (00:00 a 23:59)',
  })
  time: string;

  @ApiProperty({ example: 4, minimum: 1, maximum: 20 })
  @IsInt({ message: 'El número de personas debe ser un entero' })
  @Min(1, { message: 'Debe ser al menos 1 persona' })
  @Max(20, { message: 'Máximo 20 personas' })
  partySize: number;

  @ApiPropertyOptional({ example: 'Celebración de cumpleaños' })
  @IsOptional()
  @IsString()
  notes?: string;
}
