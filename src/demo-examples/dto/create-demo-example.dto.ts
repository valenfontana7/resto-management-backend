import {
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateDemoExampleDto {
  @IsString()
  @MaxLength(80)
  slug: string;

  @IsString()
  @MaxLength(120)
  name: string;

  @IsString()
  @MaxLength(40)
  type: string;

  @IsArray()
  @IsString({ each: true })
  cuisine: string[];

  @IsString()
  @MaxLength(80)
  city: string;

  @IsString()
  @MaxLength(80)
  neighborhood: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  leadId?: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsObject()
  payload: Record<string, unknown>;
}
