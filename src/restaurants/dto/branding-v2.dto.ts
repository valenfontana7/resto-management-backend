import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  IsEnum,
  Min,
  Max,
  IsUrl,
  IsNotEmpty,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

// ==================== Assets ====================

export class BrandingAssetsDto {
  @ApiPropertyOptional({ description: 'URL del logo del restaurante' })
  @IsOptional()
  @IsUrl()
  logo?: string;

  @ApiPropertyOptional({ description: 'URL del favicon' })
  @IsOptional()
  @IsUrl()
  favicon?: string;

  @ApiPropertyOptional({ description: 'URL de la imagen de portada/hero' })
  @IsOptional()
  @IsUrl()
  coverImage?: string;
}

// ==================== Theme ====================

export class ThemeColorsDto {
  @ApiPropertyOptional({ example: '#3b82f6', description: 'Color primario' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  primary?: string;

  @ApiPropertyOptional({ example: '#8b5cf6', description: 'Color secundario' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  secondary?: string;

  @ApiPropertyOptional({ example: '#ec4899', description: 'Color de acento' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  accent?: string;

  @ApiPropertyOptional({
    example: '#ffffff',
    description: 'Color de fondo global',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  background?: string;

  @ApiPropertyOptional({
    example: '#1f2937',
    description: 'Color de texto global',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  text?: string;

  @ApiPropertyOptional({
    example: '#6b7280',
    description: 'Color de texto secundario/muted',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  muted?: string;
}

export class ThemeTypographyDto {
  @ApiPropertyOptional({ example: 'Inter, sans-serif' })
  @IsOptional()
  @IsString()
  fontFamily?: string;

  @ApiPropertyOptional({ example: 'Poppins, sans-serif' })
  @IsOptional()
  @IsString()
  headingFontFamily?: string;
}

export class ThemeSpacingDto {
  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @ApiPropertyOptional({
    description: 'Habilitar sombras en cards globalmente',
  })
  @IsOptional()
  @IsBoolean()
  cardShadow?: boolean;
}

export class BrandingThemeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors?: ThemeColorsDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeTypographyDto)
  typography?: ThemeTypographyDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeSpacingDto)
  spacing?: ThemeSpacingDto;
}

// ==================== Layout ====================

export class BrandingLayoutDto {
  @ApiPropertyOptional({ enum: ['sm', 'md', 'lg', 'xl', '2xl', 'full'] })
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg', 'xl', '2xl', 'full'])
  maxWidth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showHeroSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showFeaturedDishes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTestimonials?: boolean;
}

// ==================== Sections ====================

// Nav Section
export class NavSectionDto {
  @ApiPropertyOptional({ enum: ['sm', 'md', 'lg'] })
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg'])
  logoSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOpenStatus?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showContactButton?: boolean;

  @ApiPropertyOptional({
    description: 'Override de color para tipos de cocina',
  })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  cuisineTypesColor?: string;

  @ApiPropertyOptional({ description: 'Navegación fija al hacer scroll' })
  @IsOptional()
  @IsBoolean()
  sticky?: boolean;
}

// Hero Section
export class HeroOverlayDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  color?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  opacity?: number;
}

export class HeroTitleDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  color?: string;

  @IsOptional()
  @IsEnum(['sm', 'md', 'lg', 'xl'])
  size?: string;
}

export class HeroDescriptionDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  color?: string;
}

export class HeroMetaDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  color?: string;
}

export class HeroSectionDto {
  @ApiPropertyOptional({ enum: ['sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg', 'xl'])
  minHeight?: string;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsEnum(['left', 'center', 'right'])
  textAlign?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  textShadow?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroOverlayDto)
  overlay?: HeroOverlayDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroTitleDto)
  title?: HeroTitleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroDescriptionDto)
  description?: HeroDescriptionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroMetaDto)
  meta?: HeroMetaDto;
}

// Menu Section
export class MenuCardStyleDto {
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @IsOptional()
  @IsBoolean()
  hoverEffect?: boolean;
}

export class MenuSectionDto {
  @ApiPropertyOptional({ enum: ['grid', 'list'] })
  @IsOptional()
  @IsEnum(['grid', 'list'])
  layout?: string;

  @ApiPropertyOptional({ enum: [1, 2, 3, 4] })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  @Type(() => Number)
  columns?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showImages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPrices?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuCardStyleDto)
  cardStyle?: MenuCardStyleDto;
}

// Cart Section
export class CartSectionDto {
  @ApiPropertyOptional({ enum: ['fixed', 'sticky', 'inline'] })
  @IsOptional()
  @IsEnum(['fixed', 'sticky', 'inline'])
  position?: string;

  @ApiPropertyOptional({ enum: ['right', 'left'] })
  @IsOptional()
  @IsEnum(['right', 'left'])
  location?: string;

  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;
}

// Footer Section
export class FooterSectionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSocialLinks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBusinessInfo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOpeningHours?: boolean;

  @ApiPropertyOptional({ enum: ['simple', 'detailed'] })
  @IsOptional()
  @IsEnum(['simple', 'detailed'])
  layout?: string;
}

// Checkout Section
export class CheckoutSectionDto {
  @ApiPropertyOptional({ enum: ['single-page', 'multi-step'] })
  @IsOptional()
  @IsEnum(['single-page', 'multi-step'])
  layout?: string;

  @ApiPropertyOptional({ enum: ['solid', 'outline', 'ghost'] })
  @IsOptional()
  @IsEnum(['solid', 'outline', 'ghost'])
  buttonStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOrderSummary?: boolean;
}

// Reservations Section
export class ReservationsSectionDto {
  @ApiPropertyOptional({ enum: ['minimal', 'card', 'full'] })
  @IsOptional()
  @IsEnum(['minimal', 'card', 'full'])
  formStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAvailability?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireDeposit?: boolean;
}

// Sections Container
export class BrandingSectionsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => NavSectionDto)
  nav?: NavSectionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroSectionDto)
  hero?: HeroSectionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuSectionDto)
  menu?: MenuSectionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CartSectionDto)
  cart?: CartSectionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => FooterSectionDto)
  footer?: FooterSectionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutSectionDto)
  checkout?: CheckoutSectionDto;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => ReservationsSectionDto)
  reservations?: ReservationsSectionDto;
}

// ==================== Mobile Menu ====================

export class MobileMenuItemDto {
  @IsString()
  @IsNotEmpty()
  label: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(\/|https?:\/\/|tel:)/, {
    message: 'href must start with /, http://, https://, or tel:',
  })
  href: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class MobileMenuStyleDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({ enum: ['bottom', 'top'] })
  @IsOptional()
  @IsEnum(['bottom', 'top'])
  position?: string;
}

export class MobileMenuDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMenuStyleDto)
  style?: MobileMenuStyleDto;

  @ApiPropertyOptional({ type: [MobileMenuItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileMenuItemDto)
  items?: MobileMenuItemDto[];
}

// ==================== Advanced ====================

export class AdvancedAnimationsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['slow', 'normal', 'fast'] })
  @IsOptional()
  @IsEnum(['slow', 'normal', 'fast'])
  speed?: string;
}

export class BrandingAdvancedDto {
  @ApiPropertyOptional({ description: 'CSS personalizado' })
  @IsOptional()
  @IsString()
  customCSS?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @ValidateNested()
  @Type(() => AdvancedAnimationsDto)
  animations?: AdvancedAnimationsDto;
}

// ==================== Main Branding DTO ====================

export class UpdateBrandingV2Dto {
  @ApiPropertyOptional({
    description: 'Assets del restaurante (logo, favicon, coverImage)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingAssetsDto)
  assets?: BrandingAssetsDto;

  @ApiPropertyOptional({
    description: 'Tema global (colores, tipografía, espaciado)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingThemeDto)
  theme?: BrandingThemeDto;

  @ApiPropertyOptional({ description: 'Configuración de layout general' })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingLayoutDto)
  layout?: BrandingLayoutDto;

  @ApiPropertyOptional({
    description: 'Configuraciones específicas por sección',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionsDto)
  sections?: BrandingSectionsDto;

  @ApiPropertyOptional({ description: 'Configuración del menú móvil' })
  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMenuDto)
  mobileMenu?: MobileMenuDto;

  @ApiPropertyOptional({ description: 'Configuraciones avanzadas' })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingAdvancedDto)
  advanced?: BrandingAdvancedDto;
}
