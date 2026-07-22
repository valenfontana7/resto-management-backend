import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsNumber,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ClientMutationIdDto } from './client-mutation-id.dto';

export class SessionItemModifierDto {
  @IsString()
  @IsNotEmpty()
  modifierId: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  priceAdjustment: number;
}

export class AddSessionItemDto {
  @IsString()
  @IsNotEmpty()
  dishId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SessionItemModifierDto)
  modifiers?: SessionItemModifierDto[];

  @IsOptional()
  @IsBoolean()
  sendToKitchen?: boolean;
}

export class AddSessionItemsDto extends ClientMutationIdDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddSessionItemDto)
  items: AddSessionItemDto[];
}

export class OpenTableSessionDto extends ClientMutationIdDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  guestCount?: number;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  waiterName?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export enum SessionPaymentMethod {
  CASH = 'cash',
  DEBIT = 'debit-card',
  CREDIT = 'credit-card',
  TRANSFER = 'bank-transfer',
  MERCADOPAGO = 'mercadopago',
}

export class CloseTableSessionDto extends ClientMutationIdDto {
  @IsEnum(SessionPaymentMethod)
  paymentMethod: SessionPaymentMethod;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  tip?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  manualDiscount?: number;

  @IsOptional()
  @IsString()
  discountReason?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @ApiPropertyOptional({
    enum: ['INTERNAL_TICKET', 'FACTURA_A', 'FACTURA_B', 'FACTURA_C'],
  })
  @IsOptional()
  @IsString()
  fiscalDocumentType?:
    | 'INTERNAL_TICKET'
    | 'FACTURA_A'
    | 'FACTURA_B'
    | 'FACTURA_C';

  @IsOptional()
  @IsString()
  customerDocType?: string;

  @IsOptional()
  @IsString()
  customerDocNumber?: string;

  @IsOptional()
  @IsInt()
  customerIvaCondition?: number;
}

export class SendToKitchenDto extends ClientMutationIdDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}

export class VoidTableSessionDto extends ClientMutationIdDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description:
      'Si true, la mesa queda en estado Limpieza; si false, Disponible',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  markTableCleaning?: boolean;
}

export class MergeTablesDto extends ClientMutationIdDto {
  @ApiPropertyOptional({
    description: 'Mesas secundarias a unir a la cuenta (por id)',
  })
  @IsArray()
  @IsString({ each: true })
  tableIds: string[];
}

export class UnmergeTableDto extends ClientMutationIdDto {
  @IsString()
  @IsNotEmpty()
  tableId: string;
}
