import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class SwitchRestaurantDto {
  @ApiProperty({
    description: 'ID del restaurante al que se quiere cambiar',
  })
  @IsString()
  @IsNotEmpty()
  restaurantId: string;
}
