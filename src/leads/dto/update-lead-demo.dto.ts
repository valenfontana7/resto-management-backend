import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LeadDemoMenuDishDto {
  @IsString()
  id: string;

  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(500)
  description: string;

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salonPrice?: number;

  @IsOptional()
  @IsString()
  image?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;
}

export class LeadDemoMenuCategoryDto {
  @IsString()
  id: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(300)
  description: string;

  @IsNumber()
  order: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadDemoMenuDishDto)
  dishes: LeadDemoMenuDishDto[];
}

export class LeadDemoHoursDto {
  @IsOptional()
  @IsString()
  monday?: string;

  @IsOptional()
  @IsString()
  tuesday?: string;

  @IsOptional()
  @IsString()
  wednesday?: string;

  @IsOptional()
  @IsString()
  thursday?: string;

  @IsOptional()
  @IsString()
  friday?: string;

  @IsOptional()
  @IsString()
  saturday?: string;

  @IsOptional()
  @IsString()
  sunday?: string;
}

export class UpdateLeadDemoDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cuisine?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  neighborhood?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  templateSlug?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  whatsapp?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadDemoHoursDto)
  hours?: LeadDemoHoursDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadDemoMenuCategoryDto)
  menu?: LeadDemoMenuCategoryDto[];

  @IsOptional()
  @IsBoolean()
  menuCustomized?: boolean;
}
