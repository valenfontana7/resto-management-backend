import {
  IsString,
  IsOptional,
  IsInt,
  Min,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SessionItemModifierDto } from './table-session.dto';

export class CreateSalonDeliveryOrderDto {
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsString()
  @IsNotEmpty()
  deliveryAddress: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  deliveryZoneId?: string;

  @IsOptional()
  @IsString()
  deliveryNotes?: string;

  @IsOptional()
  @IsString()
  paymentMethod?: string;
}

export class AddSalonDeliveryItemDto {
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

export class AddSalonDeliveryItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddSalonDeliveryItemDto)
  items: AddSalonDeliveryItemDto[];
}

export class UpdateSalonDeliveryOrderDto {
  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddress?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  deliveryZoneId?: string;
}
