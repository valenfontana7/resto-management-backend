import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendWinBackEmailDto {
  @ApiProperty({
    required: false,
    description: 'Claves de cliente (profile:..., phone:..., email:...)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  customerKeys?: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  sendToAll?: boolean;

  @ApiProperty({ required: false, default: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxRecipients?: number;
}
