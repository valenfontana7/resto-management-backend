import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUrl,
  ValidateNested,
  Matches,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  UpdateBusinessInfoDto,
  UpdateContactDto,
} from './restaurant-settings.dto';

// ==================== Branding DTOs ====================

export class BrandingColorsDto {
  @ApiPropertyOptional({ example: '#4f46e5' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  primary?: string;

  @ApiPropertyOptional({ example: '#9333ea' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  secondary?: string;

  @ApiPropertyOptional({ example: '#ec4899' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  accent?: string;

  @ApiPropertyOptional({ example: '#1f2937' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  text?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  background?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  primaryText?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  secondaryText?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  accentText?: string;
}

export class BrandingTypographyDto {
  @ApiPropertyOptional({ example: 'Inter' })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({ example: 'md', enum: ['sm', 'md', 'lg'] })
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg'])
  fontSize?: string;
}

export class BrandingLayoutDto {
  @ApiPropertyOptional({ example: 'grid', enum: ['grid', 'list', 'masonry'] })
  @IsOptional()
  @IsEnum(['grid', 'list', 'masonry'])
  menuStyle?: string;

  @ApiPropertyOptional({
    example: 'tabs',
    enum: ['tabs', 'pills', 'dropdown', 'sidebar'],
  })
  @IsOptional()
  @IsEnum(['tabs', 'pills', 'dropdown', 'sidebar'])
  categoryDisplay?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showHeroSection?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showStats?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  compactMode?: boolean;
}

export class BrandingHeroDto {
  @ApiPropertyOptional({ example: 60, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  overlayOpacity?: number;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  overlayColor?: string;

  @ApiPropertyOptional({ example: 'center', enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsEnum(['left', 'center', 'right'])
  textAlign?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  textShadow?: boolean;

  @ApiPropertyOptional({ example: 'md', enum: ['sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg', 'xl'])
  minHeight?: string;
}

export class BrandingVisualDto {
  @ApiPropertyOptional({
    example: 'md',
    enum: ['none', 'sm', 'md', 'lg', 'xl'],
  })
  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @ApiPropertyOptional({ example: 'md', enum: ['none', 'sm', 'md', 'lg'] })
  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg'])
  cardShadow?: string;

  @ApiPropertyOptional({
    example: 'normal',
    enum: ['compact', 'normal', 'relaxed'],
  })
  @IsOptional()
  @IsEnum(['compact', 'normal', 'relaxed'])
  spacing?: string;
}

export class BrandingSectionColorDto {
  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @ApiPropertyOptional({ example: '#1f2937' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;
}

export class BrandingSectionsDto {
  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  hero?: BrandingSectionColorDto;

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  menu?: BrandingSectionColorDto;

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  footer?: BrandingSectionColorDto;
}

export class MobileMenuItemDto {
  @ApiPropertyOptional({ example: 'Inicio' })
  @IsString()
  label: string;

  @ApiPropertyOptional({ example: '/' })
  @IsString()
  @Matches(/^(\/|https?:\/\/|tel:)/, {
    message: 'href must start with /, http://, https://, or tel:',
  })
  href: string;

  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class MobileMenuConfigDto {
  @ApiPropertyOptional({ example: '#FF5722' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @ApiPropertyOptional({ example: '#FFFFFF' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({ type: [MobileMenuItemDto] })
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => MobileMenuItemDto)
  items?: MobileMenuItemDto[];
}

export class BrandingDto {
  @ApiPropertyOptional({ type: BrandingColorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingColorsDto)
  colors?: BrandingColorsDto;

  @ApiPropertyOptional({ type: BrandingLayoutDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingLayoutDto)
  layout?: BrandingLayoutDto;

  @ApiPropertyOptional({ type: BrandingTypographyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingTypographyDto)
  typography?: BrandingTypographyDto;

  @ApiPropertyOptional({ example: 'data:image/png;base64,...' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: 'data:image/png;base64,...' })
  @IsOptional()
  @IsString()
  bannerImage?: string;

  @ApiPropertyOptional({ example: 'data:image/png;base64,...' })
  @IsOptional()
  @IsString()
  favicon?: string;

  @ApiPropertyOptional({ type: BrandingHeroDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingHeroDto)
  hero?: BrandingHeroDto;

  @ApiPropertyOptional({ type: BrandingVisualDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingVisualDto)
  visual?: BrandingVisualDto;

  @ApiPropertyOptional({ type: BrandingSectionsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionsDto)
  sections?: BrandingSectionsDto;

  @ApiPropertyOptional({ type: MobileMenuConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMenuConfigDto)
  mobileMenu?: MobileMenuConfigDto;
}

// ==================== Features DTO ====================

export class FeaturesDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onlineOrdering?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reservations?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  delivery?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  takeaway?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  reviews?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  socialMedia?: boolean;
}

// ==================== Social Media DTO ====================

export class SocialMediaDto {
  @ApiPropertyOptional({ example: 'https://facebook.com/restaurant' })
  @IsOptional()
  @IsUrl({}, { message: 'Facebook URL must be valid' })
  facebook?: string;

  @ApiPropertyOptional({ example: 'https://instagram.com/restaurant' })
  @IsOptional()
  @IsUrl({}, { message: 'Instagram URL must be valid' })
  instagram?: string;

  @ApiPropertyOptional({ example: 'https://twitter.com/restaurant' })
  @IsOptional()
  @IsUrl({}, { message: 'Twitter URL must be valid' })
  twitter?: string;

  @ApiPropertyOptional({ example: 'https://restaurant.com' })
  @IsOptional()
  @IsUrl({}, { message: 'Website URL must be valid' })
  website?: string;
}

// ==================== Update Restaurant Settings DTO ====================

export class UpdateRestaurantSettingsDto {
  @ApiPropertyOptional({ type: UpdateBusinessInfoDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBusinessInfoDto)
  businessInfo?: UpdateBusinessInfoDto;

  @ApiPropertyOptional({ type: UpdateContactDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateContactDto)
  contact?: UpdateContactDto;

  @ApiPropertyOptional({ example: '20-12345678-9' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}-\d{8}-\d{1}$/, {
    message: 'Invalid CUIT/CUIL format. Expected: XX-XXXXXXXX-X',
  })
  taxId?: string;

  @ApiPropertyOptional({ type: BrandingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingDto)
  branding?: BrandingDto;

  @ApiPropertyOptional({ type: FeaturesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FeaturesDto)
  features?: FeaturesDto;

  @ApiPropertyOptional({ type: SocialMediaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  socialMedia?: SocialMediaDto;
}
