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
import {
  BusinessRulesDto,
  BusinessHoursDto,
} from '../../common/dto/business.dto';

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

  @ApiPropertyOptional({ example: '#0b1220' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  titleColor?: string;

  @ApiPropertyOptional({ example: '#0b1220' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  descriptionColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  metaTextColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  cardBackgroundColor?: string;

  @ApiPropertyOptional({ example: '#e2e8f0' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  cardBorderColor?: string;

  @ApiPropertyOptional({ example: '#64748b' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  categoryTabColor?: string;

  @ApiPropertyOptional({ example: '#0b1220' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  categoryTabActiveColor?: string;

  @ApiPropertyOptional({ example: '#0b1220' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  linkColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  linkHoverColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  formBackgroundColor?: string;

  @ApiPropertyOptional({ example: '#f8fafc' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  sidebarBackgroundColor?: string;

  @ApiPropertyOptional({ example: '#f8fafc' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  summaryBackgroundColor?: string;

  @ApiPropertyOptional({ example: '#0b1220' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  summaryTextColor?: string;

  @ApiPropertyOptional({ example: '#10b981' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  successIconColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  logoSize?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showOpenStatus?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showContactButton?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showOrderNotes?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showDeliveryEstimate?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showTrackingInfo?: boolean;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  emptyStateTitle?: string;

  @ApiPropertyOptional({ example: '' })
  @IsOptional()
  @IsString()
  emptyStateMessage?: string;

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

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  nav?: BrandingSectionColorDto;

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  cart?: BrandingSectionColorDto;

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  checkout?: BrandingSectionColorDto;

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  orderConfirmation?: BrandingSectionColorDto;

  @ApiPropertyOptional({ type: BrandingSectionColorDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingSectionColorDto)
  reservations?: BrandingSectionColorDto;
}

export class BrandingCartDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({
    example: 'md',
    enum: ['none', 'sm', 'md', 'lg', 'xl'],
  })
  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;
}

export class BrandingMenuDto {
  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  cardShadow?: boolean;

  @ApiPropertyOptional({
    example: 'md',
    enum: ['none', 'sm', 'md', 'lg', 'xl'],
  })
  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;
}

export class BrandingFooterDto {
  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({ example: '#f9fafb' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  showSocialLinks?: boolean;
}

export class BrandingCheckoutDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({
    example: 'solid',
    enum: ['solid', 'outline', 'ghost'],
  })
  @IsOptional()
  @IsEnum(['solid', 'outline', 'ghost'])
  buttonStyle?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;
}

export class BrandingReservationsDto {
  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @ApiPropertyOptional({
    example: 'minimal',
    enum: ['minimal', 'card', 'full'],
  })
  @IsOptional()
  @IsEnum(['minimal', 'card', 'full'])
  formStyle?: string;

  @ApiPropertyOptional({ example: '#000000' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;
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

  @ApiPropertyOptional({ example: 'http://localhost:4000/api/uploads/...' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: 'http://localhost:4000/api/uploads/...' })
  @IsOptional()
  @IsString()
  bannerImage?: string;

  @ApiPropertyOptional({ example: 'http://localhost:4000/api/uploads/...' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ example: 'restaurants/id/favicon.ico' })
  @IsOptional()
  @IsString()
  favicon?: string;

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

  @ApiPropertyOptional({ type: BrandingCartDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingCartDto)
  cart?: BrandingCartDto;

  @ApiPropertyOptional({ type: BrandingMenuDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingMenuDto)
  menu?: BrandingMenuDto;

  @ApiPropertyOptional({ type: BrandingFooterDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingFooterDto)
  footer?: BrandingFooterDto;

  @ApiPropertyOptional({ type: BrandingCheckoutDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingCheckoutDto)
  checkout?: BrandingCheckoutDto;

  @ApiPropertyOptional({ type: BrandingReservationsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingReservationsDto)
  reservations?: BrandingReservationsDto;

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
  menu?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  orders?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  reservations?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  loyalty?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  reviews?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  giftCards?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  catering?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  onlineOrdering?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  takeaway?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  socialMedia?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  delivery?: boolean;
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

  @ApiPropertyOptional({ type: BusinessRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessRulesDto)
  businessRules?: BusinessRulesDto;

  @ApiPropertyOptional({ type: BusinessHoursDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessHoursDto)
  hours?: BusinessHoursDto;

  @ApiPropertyOptional({ type: SocialMediaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SocialMediaDto)
  socialMedia?: SocialMediaDto;
}
