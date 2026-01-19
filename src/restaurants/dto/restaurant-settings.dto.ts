import {
  IsString,
  IsEmail,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  ValidateNested,
  IsEnum,
  Min,
  IsUrl,
  Matches,
  registerDecorator,
  ValidationOptions,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Custom validator for website - accepts both URLs and relative paths (slugs)
function IsUrlOrSlug(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isUrlOrSlug',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          // Accept URLs (http/https)
          if (value.startsWith('http://') || value.startsWith('https://')) {
            try {
              new URL(value);
              return true;
            } catch {
              return false;
            }
          }
          // Accept relative paths starting with /
          if (value.startsWith('/')) {
            return value.length > 1; // Must have at least one character after /
          }
          return false;
        },
        defaultMessage() {
          return 'Website must be a valid URL (http/https) or a relative path starting with /';
        },
      },
    });
  };
}

// ==================== Business Info ====================

export class UpdateBusinessInfoDto {
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'mi-restaurante' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug?: string;

  @IsOptional()
  @IsString()
  type?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cuisineTypes?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  logo?: string;

  @IsOptional()
  @IsString()
  coverImage?: string;
}

export class UpdateContactDto {
  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsUrlOrSlug()
  website?: string;
}

export class UpdateRestaurantDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateBusinessInfoDto)
  businessInfo?: UpdateBusinessInfoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateContactDto)
  contact?: UpdateContactDto;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}-\d{8}-\d{1}$/, {
    message: 'Invalid CUIT/CUIL format. Expected: XX-XXXXXXXX-X',
  })
  taxId?: string;
}

// ==================== Business Hours ====================

export class BusinessHourDto {
  @IsInt()
  @Min(0)
  dayOfWeek: number;

  @IsBoolean()
  isOpen: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Invalid time format. Expected: HH:mm',
  })
  openTime?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
    message: 'Invalid time format. Expected: HH:mm',
  })
  closeTime?: string | null;
}

export class UpdateBusinessHoursDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BusinessHourDto)
  hours: BusinessHourDto[];
}

// ==================== Branding ====================

export class BrandingColorsDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  primary?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  secondary?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  accent?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  background?: string;
}

export class BrandingLayoutDto {
  @IsOptional()
  @IsBoolean()
  showHeroSection?: boolean;

  @IsOptional()
  @IsBoolean()
  showTestimonials?: boolean;

  @IsOptional()
  @IsEnum(['grid', 'list'])
  menuLayout?: string;
}

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

export class MobileMenuConfigDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileMenuItemDto)
  items?: MobileMenuItemDto[];
}

export class HeroSectionDto {
  @IsOptional()
  @IsEnum(['sm', 'md', 'lg', 'xl'])
  minHeight?: string;

  @IsOptional()
  @IsEnum(['left', 'center', 'right'])
  textAlign?: string;

  @IsOptional()
  @IsBoolean()
  textShadow?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  overlayColor?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  overlayOpacity?: number;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  metaTextColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  descriptionColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  titleColor?: string;
}

export class CartSectionDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;

  @IsOptional()
  @IsBoolean()
  shadow?: boolean;
}

export class MenuSectionDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @IsOptional()
  @IsBoolean()
  cardShadow?: boolean;

  @IsOptional()
  @IsEnum(['none', 'sm', 'md', 'lg', 'xl'])
  borderRadius?: string;
}

export class FooterSectionDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @IsOptional()
  @IsBoolean()
  showSocialLinks?: boolean;
}

export class CheckoutSectionDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @IsOptional()
  @IsEnum(['solid', 'outline', 'ghost'])
  buttonStyle?: string;

  @IsOptional()
  @IsBoolean()
  shadow?: boolean;
}

export class ReservationsSectionDto {
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  backgroundColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, { message: 'Invalid hex color format' })
  textColor?: string;

  @IsOptional()
  @IsEnum(['minimal', 'card', 'full'])
  formStyle?: string;

  @IsOptional()
  @IsBoolean()
  shadow?: boolean;
}

export class UpdateBrandingDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingColorsDto)
  colors?: BrandingColorsDto;

  @IsOptional()
  @IsUrl()
  logo?: string;

  @IsOptional()
  @IsUrl()
  favicon?: string;

  @IsOptional()
  @IsUrl()
  coverImage?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BrandingLayoutDto)
  layout?: BrandingLayoutDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMenuConfigDto)
  mobileMenu?: MobileMenuConfigDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => HeroSectionDto)
  hero?: HeroSectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CartSectionDto)
  cart?: CartSectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => MenuSectionDto)
  menu?: MenuSectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => FooterSectionDto)
  footer?: FooterSectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutSectionDto)
  checkout?: CheckoutSectionDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => ReservationsSectionDto)
  reservations?: ReservationsSectionDto;
}

// ==================== Payment Methods ====================

export enum PaymentMethod {
  CASH = 'cash',
  DEBIT_CARD = 'debit-card',
  CREDIT_CARD = 'credit-card',
  BANK_TRANSFER = 'bank-transfer',
  DIGITAL_WALLET = 'digital-wallet',
  CRYPTO = 'crypto',
}

export class UpdatePaymentMethodsDto {
  @IsArray()
  @IsEnum(PaymentMethod, { each: true })
  paymentMethods: string[];

  @IsOptional()
  @IsBoolean()
  acceptsOnlinePayment?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresPaymentOnDelivery?: boolean;
}

// ==================== Delivery Zones ====================

export class DeliveryZoneDto {
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  name: string;

  @IsInt()
  @Min(0)
  deliveryFee: number;

  @IsInt()
  @Min(0)
  minOrder: number;

  @IsString()
  estimatedTime: string;

  @IsArray()
  @IsString({ each: true })
  areas: string[];
}

export class UpdateDeliveryZonesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DeliveryZoneDto)
  deliveryZones: DeliveryZoneDto[];

  @IsOptional()
  @IsBoolean()
  enableDelivery?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxDeliveryDistance?: number;
}

// ==================== Users & Roles ====================

export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MANAGER = 'manager',
  WAITER = 'waiter',
  KITCHEN = 'kitchen',
}

export class InviteUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({
    example: 'clx123abc456def',
    description: 'Role ID (preferred)',
  })
  @IsOptional()
  @IsString()
  roleId?: string;

  @ApiPropertyOptional({
    example: 'Manager',
    description: 'Role name (deprecated, use roleId)',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  sendInvitation?: boolean;
}

export class UpdateUserRoleDto {
  @IsOptional()
  @IsString()
  roleId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
