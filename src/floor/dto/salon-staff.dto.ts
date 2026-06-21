import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class QuickAddSalonStaffDto {
  @ApiProperty({ example: 'María López' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ example: '+54 9 11 5555-1234' })
  @IsOptional()
  @IsString()
  phone?: string;
}
