import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class CustomerFavoriteDishDto {
  @IsString()
  @MaxLength(80)
  dishId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;
}

class CustomerPreferencesDto {
  @IsOptional()
  @IsIn(['delivery', 'pickup'])
  preferredOrderType?: 'delivery' | 'pickup';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  dietaryNotes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CustomerFavoriteDishDto)
  favoriteDishes?: CustomerFavoriteDishDto[];
}

class CustomerDefaultAddressDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  street?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  reference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  notes?: string;
}

export class UpdateCustomerAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsBoolean()
  marketingOptIn?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerDefaultAddressDto)
  defaultAddress?: CustomerDefaultAddressDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerPreferencesDto)
  preferences?: CustomerPreferencesDto;
}
