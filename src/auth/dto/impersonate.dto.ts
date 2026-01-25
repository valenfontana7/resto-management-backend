import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ImpersonateDto {
  @ApiProperty({
    description: 'The ID of the restaurant to impersonate',
    example: 'clq...123',
  })
  @IsString()
  @IsNotEmpty()
  restaurantId: string;
}
