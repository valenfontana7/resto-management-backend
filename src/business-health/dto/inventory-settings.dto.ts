import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInventorySettingsDto {
  @ApiPropertyOptional({
    description:
      'Descontar insumos automáticamente al cobrar un pedido (según receta BOM)',
  })
  @IsOptional()
  @IsBoolean()
  autoDeductOnSale?: boolean;
}
