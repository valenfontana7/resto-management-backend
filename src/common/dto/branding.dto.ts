import {
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsUrl,
  Matches,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Shared DTO definitions for restaurant branding.
 * These are used by both UpdateRestaurantSettingsDto and dedicated branding endpoints.
 */

// ==================== Branding Colors ====================

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

// ==================== Branding Typography ====================

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

// ==================== Branding Layout ====================

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
  showAboutSection?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showContactInfo?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showHours?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showSocialLinks?: boolean;

  @ApiPropertyOptional({ example: 'sm', enum: ['sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @ApiPropertyOptional({ example: 'none', enum: ['none', 'sm', 'md', 'lg'] })
  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg'])
  shadow?: string;
}

// ==================== Branding Effects ====================

export class BrandingEffectsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  hoverAnimations?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  fadeIn?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  parallaxHeader?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  smoothScroll?: boolean;
}

// ==================== Branding Images ====================

export class BrandingImagesDto {
  @ApiPropertyOptional({ example: 'https://example.com/logo.png' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: 'https://example.com/banner.jpg' })
  @IsOptional()
  @IsString()
  banner?: string;

  @ApiPropertyOptional({ example: 'https://example.com/hero.jpg' })
  @IsOptional()
  @IsString()
  heroImage?: string;

  @ApiPropertyOptional({ example: 'https://example.com/og-image.jpg' })
  @IsOptional()
  @IsString()
  ogImage?: string;

  @ApiPropertyOptional({ example: 'https://example.com/favicon.ico' })
  @IsOptional()
  @IsString()
  favicon?: string;

  @ApiPropertyOptional({ example: 'https://example.com/about.jpg' })
  @IsOptional()
  @IsString()
  aboutImage?: string;
}

// ==================== Social Media ====================

export class SocialMediaLinksDto {
  @ApiPropertyOptional({ example: 'https://facebook.com/restaurant' })
  @IsOptional()
  @IsUrl()
  facebook?: string;

  @ApiPropertyOptional({ example: 'https://instagram.com/restaurant' })
  @IsOptional()
  @IsUrl()
  instagram?: string;

  @ApiPropertyOptional({ example: 'https://twitter.com/restaurant' })
  @IsOptional()
  @IsUrl()
  twitter?: string;

  @ApiPropertyOptional({ example: 'https://tiktok.com/@restaurant' })
  @IsOptional()
  @IsUrl()
  tiktok?: string;

  @ApiPropertyOptional({ example: 'https://youtube.com/@restaurant' })
  @IsOptional()
  @IsUrl()
  youtube?: string;

  @ApiPropertyOptional({ example: 'https://linkedin.com/company/restaurant' })
  @IsOptional()
  @IsUrl()
  linkedin?: string;
}

// ==================== Theme Configuration ====================

export class ThemeDto {
  @ApiPropertyOptional({ example: 'light', enum: ['light', 'dark', 'auto'] })
  @IsOptional()
  @IsEnum(['light', 'dark', 'auto'])
  mode?: string;

  @ApiPropertyOptional({ example: 'default' })
  @IsOptional()
  @IsString()
  preset?: string;
}

// ==================== Composite Branding DTO ====================

export class BrandingDto {
  @ApiPropertyOptional({ type: BrandingColorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingColorsDto)
  colors?: BrandingColorsDto;

  @ApiPropertyOptional({ type: BrandingTypographyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingTypographyDto)
  typography?: BrandingTypographyDto;

  @ApiPropertyOptional({ type: BrandingLayoutDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingLayoutDto)
  layout?: BrandingLayoutDto;

  @ApiPropertyOptional({ type: BrandingEffectsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingEffectsDto)
  effects?: BrandingEffectsDto;

  @ApiPropertyOptional({ type: BrandingImagesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingImagesDto)
  images?: BrandingImagesDto;

  @ApiPropertyOptional({ type: SocialMediaLinksDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaLinksDto)
  socialMedia?: SocialMediaLinksDto;

  @ApiPropertyOptional({ type: ThemeDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeDto)
  theme?: ThemeDto;

  @ApiPropertyOptional({ example: 'Welcome to our restaurant!' })
  @IsOptional()
  @IsString()
  customCss?: string;

  @ApiPropertyOptional({ example: '<div>Custom content</div>' })
  @IsOptional()
  @IsString()
  headerHtml?: string;

  @ApiPropertyOptional({ example: '<div>Footer content</div>' })
  @IsOptional()
  @IsString()
  footerHtml?: string;
}
