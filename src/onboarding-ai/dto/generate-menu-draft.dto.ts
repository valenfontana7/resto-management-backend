import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateMenuDraftDto {
  @ApiProperty({
    description:
      'Descripcion del menu, tipo de comida y platos que ofrece el restaurante.',
    example:
      'Pizzeria con pizzas a la piedra, empanadas de carne y humita, postres caseros y gaseosas. Precios de pizza entre 8000 y 12000.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(2000)
  prompt: string;

  @ApiProperty({ required: false, example: 'Fuego y Masa' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  restaurantName?: string;
}
