import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class ConsumeCustomerSessionDto {
  @ApiProperty({ example: 'raw-token-from-email' })
  @IsString()
  token: string;
}
