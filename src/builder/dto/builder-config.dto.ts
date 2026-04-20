import {
  IsString,
  IsObject,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsArray,
  ValidateNested,
  IsIn,
  Matches,
  Min,
  Max,
} from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { normalizeRestaurantDraftPayload } from '../utils/restaurant-draft.util';

// ==================== BASE DTOs ====================

const HEX_COLOR_REGEX = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;

// ==================== THEME DTOs ====================

export class ThemeColorsDto {
  @ApiPropertyOptional({ example: '#3b82f6' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'primary must be a valid hex color' })
  primary?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'primaryText must be a valid hex color',
  })
  primaryText?: string;

  @ApiPropertyOptional({ example: '#2563eb' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'primaryHover must be a valid hex color',
  })
  primaryHover?: string;

  @ApiPropertyOptional({ example: '#8b5cf6' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'secondary must be a valid hex color' })
  secondary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'secondaryText must be a valid hex color',
  })
  secondaryText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'secondaryHover must be a valid hex color',
  })
  secondaryHover?: string;

  @ApiPropertyOptional({ example: '#ec4899' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'accent must be a valid hex color' })
  accent?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'accentText must be a valid hex color' })
  accentText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'accentHover must be a valid hex color',
  })
  accentHover?: string;

  @ApiPropertyOptional({ example: '#ffffff' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'background must be a valid hex color' })
  background?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'foreground must be a valid hex color' })
  foreground?: string;

  @ApiPropertyOptional({ example: '#0f172a' })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'text must be a valid hex color' })
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'textSecondary must be a valid hex color',
  })
  textSecondary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'border must be a valid hex color' })
  border?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'muted must be a valid hex color' })
  muted?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'mutedForeground must be a valid hex color',
  })
  mutedForeground?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'success must be a valid hex color' })
  success?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'warning must be a valid hex color' })
  warning?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'error must be a valid hex color' })
  error?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'info must be a valid hex color' })
  info?: string;
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

  @ApiPropertyOptional({ example: 'monospace' })
  @IsOptional()
  @IsString()
  monoFontFamily?: string;

  @ApiPropertyOptional({ enum: ['xs', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  fontSize?: string;

  @ApiPropertyOptional({ example: 1.25 })
  @IsOptional()
  @IsNumber()
  headingScale?: number;

  @ApiPropertyOptional({ example: 400 })
  @IsOptional()
  @IsNumber()
  fontWeightNormal?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  fontWeightMedium?: number;

  @ApiPropertyOptional({ example: 600 })
  @IsOptional()
  @IsNumber()
  fontWeightSemibold?: number;

  @ApiPropertyOptional({ example: 700 })
  @IsOptional()
  @IsNumber()
  fontWeightBold?: number;

  @ApiPropertyOptional({ example: 1.25 })
  @IsOptional()
  @IsNumber()
  lineHeightTight?: number;

  @ApiPropertyOptional({ example: 1.5 })
  @IsOptional()
  @IsNumber()
  lineHeightNormal?: number;

  @ApiPropertyOptional({ example: 1.75 })
  @IsOptional()
  @IsNumber()
  lineHeightRelaxed?: number;
}

export class ThemeSpacingDto {
  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadiusButton?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadiusCard?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadiusInput?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  cardShadow?: boolean;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  shadowSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'shadowColor must be a valid hex color',
  })
  shadowColor?: string;

  @ApiPropertyOptional({ enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'])
  containerPadding?: string;

  @ApiPropertyOptional({ enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'])
  sectionPadding?: string;
}

export class ThemeAnimationsDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsNumber()
  durationFast?: number;

  @ApiPropertyOptional({ example: 300 })
  @IsOptional()
  @IsNumber()
  durationNormal?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  durationSlow?: number;

  @ApiPropertyOptional({ enum: ['none', 'lift', 'scale', 'glow', 'rotate'] })
  @IsOptional()
  @IsIn(['none', 'lift', 'scale', 'glow', 'rotate'])
  hoverEffect?: string;

  @ApiPropertyOptional({ enum: ['none', 'fade', 'slide', 'zoom'] })
  @IsOptional()
  @IsIn(['none', 'fade', 'slide', 'zoom'])
  pageTransition?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  scrollReveal?: boolean;
}

export class ThemeConfigDto {
  @ApiPropertyOptional({ type: ThemeColorsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeColorsDto)
  colors?: ThemeColorsDto;

  @ApiPropertyOptional({ type: ThemeTypographyDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeTypographyDto)
  typography?: ThemeTypographyDto;

  @ApiPropertyOptional({ type: ThemeSpacingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeSpacingDto)
  spacing?: ThemeSpacingDto;

  @ApiPropertyOptional({ type: ThemeAnimationsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeAnimationsDto)
  animations?: ThemeAnimationsDto;
}

// ==================== ASSETS DTOs ====================

export class AssetsConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoLight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoDark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  logoMobile?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  favicon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bannerImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  heroBackgroundImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundPattern?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultProductImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultCategoryImage?: string;
}

// ==================== LAYOUT DTOs ====================

export class BreakpointsDto {
  @ApiPropertyOptional({ example: 640 })
  @IsOptional()
  @IsNumber()
  mobile?: number;

  @ApiPropertyOptional({ example: 768 })
  @IsOptional()
  @IsNumber()
  tablet?: number;

  @ApiPropertyOptional({ example: 1024 })
  @IsOptional()
  @IsNumber()
  desktop?: number;

  @ApiPropertyOptional({ example: 1280 })
  @IsOptional()
  @IsNumber()
  wide?: number;
}

export class LayoutConfigDto {
  @ApiPropertyOptional({ enum: ['sm', 'md', 'lg', 'xl', '2xl', 'full'] })
  @IsOptional()
  @IsIn(['sm', 'md', 'lg', 'xl', '2xl', 'full'])
  maxWidth?: string;

  @ApiPropertyOptional({ example: '1400px' })
  @IsOptional()
  @IsString()
  containerMaxWidth?: string;

  @ApiPropertyOptional({ enum: ['grid', 'list', 'masonry', 'carousel'] })
  @IsOptional()
  @IsIn(['grid', 'list', 'masonry', 'carousel'])
  menuStyle?: string;

  @ApiPropertyOptional({ enum: [1, 2, 3, 4, 5, 6] })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  menuColumns?: number;

  @ApiPropertyOptional({ enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'])
  menuGap?: string;

  @ApiPropertyOptional({
    enum: ['tabs', 'pills', 'dropdown', 'sidebar', 'accordion'],
  })
  @IsOptional()
  @IsIn(['tabs', 'pills', 'dropdown', 'sidebar', 'accordion'])
  categoryDisplay?: string;

  @ApiPropertyOptional({ enum: ['top', 'left', 'right'] })
  @IsOptional()
  @IsIn(['top', 'left', 'right'])
  categoryPosition?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  showHeroSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showStatsSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showHighlightsSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTestimonialsSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showFeaturesSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showGallerySection?: boolean;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  compactMode?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stickyHeader?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  stickyCart?: boolean;

  @ApiPropertyOptional({ type: BreakpointsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BreakpointsDto)
  breakpoints?: BreakpointsDto;
}

// ==================== NAVIGATION SECTION DTO ====================

export class NavigationConfigDto {
  @ApiPropertyOptional({
    enum: ['static', 'relative', 'absolute', 'fixed', 'sticky'],
  })
  @IsOptional()
  @IsIn(['static', 'relative', 'absolute', 'fixed', 'sticky'])
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sticky?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hideOnScroll?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'borderColor must be a valid hex color',
  })
  borderColor?: string;

  @ApiPropertyOptional({ enum: ['sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['sm', 'md', 'lg', 'xl'])
  logoSize?: string;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  logoPosition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'titleColor must be a valid hex color' })
  titleColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTitle?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCuisineTypes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'cuisineTypesColor must be a valid hex color',
  })
  cuisineTypesColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOpenStatus?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'openStatusColor must be a valid hex color',
  })
  openStatusColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'closedStatusColor must be a valid hex color',
  })
  closedStatusColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showContactButton?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCartButton?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSearchButton?: boolean;

  @ApiPropertyOptional({ enum: ['text', 'outlined', 'filled'] })
  @IsOptional()
  @IsIn(['text', 'outlined', 'filled'])
  buttonStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  transparency?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blur?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  blurAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  shadowSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  borderBottom?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  height?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  mobileHeight?: number;

  @ApiPropertyOptional({ enum: ['drawer', 'fullscreen', 'dropdown'] })
  @IsOptional()
  @IsIn(['drawer', 'fullscreen', 'dropdown'])
  mobileMenuStyle?: string;

  @ApiPropertyOptional({ enum: ['left', 'right', 'top', 'bottom'] })
  @IsOptional()
  @IsIn(['left', 'right', 'top', 'bottom'])
  mobileMenuPosition?: string;

  @ApiPropertyOptional({
    enum: ['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl'],
  })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'base', 'lg', 'xl', '2xl', '3xl'])
  titleSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  titleWeight?: number;
}

// ==================== HERO SECTION DTO ====================

export class HeroOverlayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'overlay.color must be a valid hex color',
  })
  color?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  opacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  gradient?: string;
}

export class HeroMetaDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'meta.color must be a valid hex color',
  })
  color?: string;
}

export class HeroTitleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiPropertyOptional({
    enum: [
      'xs',
      'sm',
      'md',
      'base',
      'lg',
      'xl',
      '2xl',
      '3xl',
      '4xl',
      '5xl',
      '6xl',
    ],
  })
  @IsOptional()
  @IsIn([
    'xs',
    'sm',
    'md',
    'base',
    'lg',
    'xl',
    '2xl',
    '3xl',
    '4xl',
    '5xl',
    '6xl',
  ])
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'shadowColor must be a valid hex color',
  })
  shadowColor?: string;

  @ApiPropertyOptional({ enum: ['none', 'fade-in', 'slide-up', 'scale-in'] })
  @IsOptional()
  @IsIn(['none', 'fade-in', 'slide-up', 'scale-in'])
  animation?: string;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  align?: string;
}

export class HeroSubtitleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiPropertyOptional({
    enum: [
      'xs',
      'sm',
      'md',
      'base',
      'lg',
      'xl',
      '2xl',
      '3xl',
      '4xl',
      '5xl',
      '6xl',
    ],
  })
  @IsOptional()
  @IsIn([
    'xs',
    'sm',
    'md',
    'base',
    'lg',
    'xl',
    '2xl',
    '3xl',
    '4xl',
    '5xl',
    '6xl',
  ])
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shadow?: boolean;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  align?: string;
}

export class HeroCtaButtonDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  href?: string;

  @ApiPropertyOptional({ enum: ['primary', 'secondary', 'outline', 'ghost'] })
  @IsOptional()
  @IsIn(['primary', 'secondary', 'outline', 'ghost'])
  style?: string;

  @ApiPropertyOptional({ enum: ['xs', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;
}

export class HeroConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundImage?: string;

  @ApiPropertyOptional({ enum: ['cover', 'contain', 'auto'] })
  @IsOptional()
  @IsIn(['cover', 'contain', 'auto'])
  backgroundSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  backgroundPosition?: string;

  @ApiPropertyOptional({ enum: ['scroll', 'fixed', 'local'] })
  @IsOptional()
  @IsIn(['scroll', 'fixed', 'local'])
  backgroundAttachment?: string;

  @ApiPropertyOptional({
    type: HeroOverlayDto,
    description: 'Overlay configuration (nested)',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroOverlayDto)
  overlay?: HeroOverlayDto;

  @ApiPropertyOptional({ enum: ['auto', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['auto', 'sm', 'md', 'lg', 'xl', 'full'])
  height?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  minHeight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  maxHeight?: string;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right', 'justify'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right', 'justify'])
  textAlign?: string;

  @ApiPropertyOptional({ enum: ['top', 'center', 'bottom'] })
  @IsOptional()
  @IsIn(['top', 'center', 'bottom'])
  contentPosition?: string;

  @ApiPropertyOptional({ enum: ['start', 'center', 'end'] })
  @IsOptional()
  @IsIn(['start', 'center', 'end'])
  contentJustify?: string;

  @ApiPropertyOptional({ type: HeroTitleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroTitleDto)
  title?: HeroTitleDto;

  @ApiPropertyOptional({ type: HeroSubtitleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroSubtitleDto)
  subtitle?: HeroSubtitleDto;

  @ApiPropertyOptional({ type: HeroCtaButtonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroCtaButtonDto)
  ctaButton?: HeroCtaButtonDto;

  @ApiPropertyOptional({ type: HeroCtaButtonDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroCtaButtonDto)
  secondaryCta?: HeroCtaButtonDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  parallax?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  kenBurns?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showRating?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDeliveryTime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPriceRange?: boolean;

  @ApiPropertyOptional({ type: HeroMetaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroMetaDto)
  meta?: HeroMetaDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  textShadow?: boolean;
}

// ==================== MENU SECTION DTO ====================

export class MenuTitleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiPropertyOptional({
    enum: [
      'xs',
      'sm',
      'md',
      'base',
      'lg',
      'xl',
      '2xl',
      '3xl',
      '4xl',
      '5xl',
      '6xl',
    ],
  })
  @IsOptional()
  @IsIn([
    'xs',
    'sm',
    'md',
    'base',
    'lg',
    'xl',
    '2xl',
    '3xl',
    '4xl',
    '5xl',
    '6xl',
  ])
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right'])
  align?: string;
}

export class MenuConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional({ type: MenuTitleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuTitleDto)
  title?: MenuTitleDto;

  @ApiPropertyOptional({ type: MenuTitleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuTitleDto)
  subtitle?: MenuTitleDto;

  @ApiPropertyOptional({ enum: ['flat', 'outlined', 'elevated', 'glass'] })
  @IsOptional()
  @IsIn(['flat', 'outlined', 'elevated', 'glass'])
  cardStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'cardBackgroundColor must be a valid hex color',
  })
  cardBackgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'cardBorderColor must be a valid hex color',
  })
  cardBorderColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cardBorderWidth?: number;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  cardShadow?: string;

  @ApiPropertyOptional({ enum: ['lift', 'scale', 'glow', 'none'] })
  @IsOptional()
  @IsIn(['lift', 'scale', 'glow', 'none'])
  cardHoverEffect?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;

  @ApiPropertyOptional({ enum: ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'])
  itemSpacing?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  columns?: number;

  @ApiPropertyOptional({ enum: ['underline', 'pills', 'buttons', 'minimal'] })
  @IsOptional()
  @IsIn(['underline', 'pills', 'buttons', 'minimal'])
  categoryTabStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'categoryTabColor must be a valid hex color',
  })
  categoryTabColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'categoryTabActiveColor must be a valid hex color',
  })
  categoryTabActiveColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'categoryTabActiveBackground must be a valid hex color',
  })
  categoryTabActiveBackground?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showImages?: boolean;

  @ApiPropertyOptional({ enum: ['1:1', '4:3', '16:9', '3:2'] })
  @IsOptional()
  @IsIn(['1:1', '4:3', '16:9', '3:2'])
  imageAspectRatio?: string;

  @ApiPropertyOptional({ enum: ['top', 'left', 'right', 'background'] })
  @IsOptional()
  @IsIn(['top', 'left', 'right', 'background'])
  imagePosition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPrices?: boolean;

  @ApiPropertyOptional({ enum: ['xs', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  priceSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'priceColor must be a valid hex color' })
  priceColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDescriptions?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  descriptionLines?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showRatings?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPreparationTime?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showCalories?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDietaryInfo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBadges?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'featuredBadgeColor must be a valid hex color',
  })
  featuredBadgeColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'newBadgeColor must be a valid hex color',
  })
  newBadgeColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'popularBadgeColor must be a valid hex color',
  })
  popularBadgeColor?: string;

  @ApiPropertyOptional({ enum: ['icon', 'text', 'icon-text'] })
  @IsOptional()
  @IsIn(['icon', 'text', 'icon-text'])
  addButtonStyle?: string;

  @ApiPropertyOptional({ enum: ['bottom', 'top-right', 'center', 'overlay'] })
  @IsOptional()
  @IsIn(['bottom', 'top-right', 'center', 'overlay'])
  addButtonPosition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'addButtonColor must be a valid hex color',
  })
  addButtonColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSearch?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showFilters?: boolean;

  @ApiPropertyOptional({ enum: ['top', 'sidebar'] })
  @IsOptional()
  @IsIn(['top', 'sidebar'])
  filterPosition?: string;
}

// ==================== INFO SECTION DTO ====================

export class CuisineTypesStyleDto {
  @ApiPropertyOptional({
    example: '#ffffff',
    description: 'Color del texto del badge',
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiPropertyOptional({
    example: '#3b82f6',
    description: 'Color de fondo del badge',
  })
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional({
    enum: ['xs', 'sm', 'md', 'lg', 'xl'],
    description: 'Tamaño del badge',
  })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  size?: string;

  @ApiPropertyOptional({
    enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'],
    description: 'Radio de borde del badge',
  })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;
}

export class InfoSectionConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional({ enum: ['cards', 'columns', 'accordion', 'tabs'] })
  @IsOptional()
  @IsIn(['cards', 'columns', 'accordion', 'tabs'])
  layout?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(4)
  columns?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLocation?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showHours?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showContact?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showMap?: boolean;

  @ApiPropertyOptional({ enum: ['roadmap', 'satellite', 'terrain', 'hybrid'] })
  @IsOptional()
  @IsIn(['roadmap', 'satellite', 'terrain', 'hybrid'])
  mapStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  mapZoom?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mapHeight?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'iconColor must be a valid hex color' })
  iconColor?: string;

  @ApiPropertyOptional({ enum: ['xs', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  iconSize?: string;

  @ApiPropertyOptional({ enum: ['outline', 'filled', 'duotone'] })
  @IsOptional()
  @IsIn(['outline', 'filled', 'duotone'])
  iconStyle?: string;

  @ApiPropertyOptional({ type: MenuTitleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuTitleDto)
  title?: MenuTitleDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'cardBackgroundColor must be a valid hex color',
  })
  cardBackgroundColor?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  cardBorderRadius?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  cardShadow?: string;

  @ApiPropertyOptional({ type: CuisineTypesStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CuisineTypesStyleDto)
  cuisineTypesStyle?: CuisineTypesStyleDto;
}

// ==================== FOOTER SECTION DTO ====================

export class FooterConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSection?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'linkColor must be a valid hex color' })
  linkColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'linkHoverColor must be a valid hex color',
  })
  linkHoverColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'borderTopColor must be a valid hex color',
  })
  borderTopColor?: string;

  @ApiPropertyOptional({ enum: ['simple', 'detailed', 'minimal', 'mega'] })
  @IsOptional()
  @IsIn(['simple', 'detailed', 'minimal', 'mega'])
  layout?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(6)
  columns?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDescription?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSocialLinks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOpeningHours?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showBusinessInfo?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showQuickLinks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showLegalLinks?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showNewsletter?: boolean;

  @ApiPropertyOptional({ enum: ['circle', 'square', 'rounded', 'minimal'] })
  @IsOptional()
  @IsIn(['circle', 'square', 'rounded', 'minimal'])
  socialIconStyle?: string;

  @ApiPropertyOptional({ enum: ['xs', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  socialIconSize?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'socialIconColor must be a valid hex color',
  })
  socialIconColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  copyrightText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'copyrightColor must be a valid hex color',
  })
  copyrightColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPoweredBy?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTopBorder?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDecorations?: boolean;
}

// ==================== CART SECTION DTO ====================

export class CartConfigDto {
  @ApiPropertyOptional({ enum: ['sidebar', 'modal', 'page', 'drawer'] })
  @IsOptional()
  @IsIn(['sidebar', 'modal', 'page', 'drawer'])
  style?: string;

  @ApiPropertyOptional({ enum: ['left', 'right'] })
  @IsOptional()
  @IsIn(['left', 'right'])
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'borderColor must be a valid hex color',
  })
  borderColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'summaryBackgroundColor must be a valid hex color',
  })
  summaryBackgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'summaryTextColor must be a valid hex color',
  })
  summaryTextColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'checkoutButtonColor must be a valid hex color',
  })
  checkoutButtonColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  checkoutButtonText?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  continueShoppingText?: string;

  @ApiPropertyOptional({ enum: ['rounded', 'square', 'pill'] })
  @IsOptional()
  @IsIn(['rounded', 'square', 'pill'])
  buttonStyle?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  shadow?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  blur?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emptyStateIcon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emptyStateTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emptyStateMessage?: string;

  @ApiPropertyOptional({ enum: ['xs', 'sm', 'md', 'lg', 'xl'] })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl'])
  itemImageSize?: string;

  @ApiPropertyOptional({ enum: ['square', 'rounded', 'circle'] })
  @IsOptional()
  @IsIn(['square', 'rounded', 'circle'])
  itemImageShape?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showItemImages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSubtotal?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTax?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDeliveryFee?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDiscounts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTip?: boolean;
}

export class ContentTextConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiPropertyOptional({
    enum: ['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'],
  })
  @IsOptional()
  @IsIn(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'])
  size?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ enum: ['left', 'center', 'right', 'justify'] })
  @IsOptional()
  @IsIn(['left', 'center', 'right', 'justify'])
  align?: string;
}

export class ContentButtonStyleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'color must be a valid hex color' })
  color?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;
}

export class ContentButtonConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({ enum: ['sm', 'md', 'lg'] })
  @IsOptional()
  @IsIn(['sm', 'md', 'lg'])
  size?: string;

  @ApiPropertyOptional({ type: ContentButtonStyleDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentButtonStyleDto)
  style?: ContentButtonStyleDto;
}

// ==================== MOBILE MENU DTO ====================

export class MobileMenuItemDto {
  @ApiProperty()
  @IsString()
  label: string;

  @ApiProperty()
  @IsString()
  href: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  order?: number;
}

export class MobileMenuConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'activeColor must be a valid hex color',
  })
  activeColor?: string;

  @ApiPropertyOptional({ enum: ['left', 'right', 'top', 'bottom'] })
  @IsOptional()
  @IsIn(['left', 'right', 'top', 'bottom'])
  position?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  width?: string;

  @ApiPropertyOptional({ type: [MobileMenuItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MobileMenuItemDto)
  items?: MobileMenuItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  overlay?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'overlayColor must be a valid hex color',
  })
  overlayColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  overlayOpacity?: number;

  @ApiPropertyOptional({ enum: ['slide', 'fade', 'scale'] })
  @IsOptional()
  @IsIn(['slide', 'fade', 'scale'])
  animationType?: string;
}

// ==================== SEO DTO ====================

export class SEOConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogImage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ogType?: string;

  @ApiPropertyOptional({
    enum: ['summary', 'summary_large_image', 'app', 'player'],
  })
  @IsOptional()
  @IsIn(['summary', 'summary_large_image', 'app', 'player'])
  twitterCard?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitterTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitterDescription?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  twitterImage?: string;

  @ApiPropertyOptional({ enum: ['Restaurant', 'Cafe', 'FoodEstablishment'] })
  @IsOptional()
  @IsIn(['Restaurant', 'Cafe', 'FoodEstablishment'])
  schemaType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  schemaData?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  canonicalUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  robots?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  language?: string;
}

// ==================== ADVANCED DTO ====================

export class ChatWidgetConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ enum: ['whatsapp', 'messenger', 'custom'] })
  @IsOptional()
  @IsIn(['whatsapp', 'messenger', 'custom'])
  provider?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class AdvancedConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customCSS?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customJS?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  googleAnalyticsId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  facebookPixelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  customTrackingCode?: string;

  @ApiPropertyOptional({ type: ChatWidgetConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ChatWidgetConfigDto)
  chatWidget?: ChatWidgetConfigDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  lazyLoadImages?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enableCaching?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  preloadFonts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highContrast?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reducedMotion?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  focusIndicators?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  ariaLabels?: Record<string, string>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pwaEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'pwaThemeColor must be a valid hex color',
  })
  pwaThemeColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'pwaBackgroundColor must be a valid hex color',
  })
  pwaBackgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  experimentalFeatures?: string[];
}

// ==================== CHECKOUT SECTION DTO ====================

export class CheckoutConfigDto {
  @ApiPropertyOptional({
    enum: [
      'single-page',
      'multi-step',
      'single-column',
      'two-column',
      'sidebar',
    ],
  })
  @IsOptional()
  @IsIn(['single-page', 'multi-step', 'single-column', 'two-column', 'sidebar'])
  layout?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'formBackgroundColor must be a valid hex color',
  })
  formBackgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'sidebarBackgroundColor must be a valid hex color',
  })
  sidebarBackgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cardShadow?: boolean;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  shadow?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;

  @ApiPropertyOptional({
    enum: ['solid', 'outline', 'ghost', 'square', 'rounded', 'pill'],
  })
  @IsOptional()
  @IsIn(['solid', 'outline', 'ghost', 'square', 'rounded', 'pill'])
  buttonStyle?: string;

  @ApiPropertyOptional({
    enum: ['minimal', 'card', 'full', 'filled', 'outlined', 'bordered'],
  })
  @IsOptional()
  @IsIn(['minimal', 'card', 'full', 'filled', 'outlined', 'bordered'])
  formStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOrderSummary?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showOrderNotes?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showDeliveryEstimate?: boolean;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  backLink?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  title?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  subtitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  customerSectionTitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  customerSectionSubtitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  deliverySectionTitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  deliverySectionSubtitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  sidebarTitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  sidebarSubtitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentButtonConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentButtonConfigDto)
  submitButton?: ContentButtonConfigDto;
}

export class OrderConfirmationConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'successIconColor must be a valid hex color',
  })
  successIconColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showTrackingInfo?: boolean;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  title?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  subtitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  statusTitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  nextStepTitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  trackingInfo?: ContentTextConfigDto;
}

// ==================== RESERVATIONS SECTION DTO ====================

export class ReservationsConfigDto {
  @ApiPropertyOptional({
    enum: [
      'single-page',
      'multi-step',
      'single-column',
      'two-column',
      'sidebar',
    ],
  })
  @IsOptional()
  @IsIn(['single-page', 'multi-step', 'single-column', 'two-column', 'sidebar'])
  layout?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, {
    message: 'backgroundColor must be a valid hex color',
  })
  backgroundColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(HEX_COLOR_REGEX, { message: 'textColor must be a valid hex color' })
  textColor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  cardShadow?: boolean;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', '2xl'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', '2xl'])
  shadow?: string;

  @ApiPropertyOptional({ enum: ['none', 'sm', 'md', 'lg', 'xl', 'full'] })
  @IsOptional()
  @IsIn(['none', 'sm', 'md', 'lg', 'xl', 'full'])
  borderRadius?: string;

  @ApiPropertyOptional({
    enum: ['solid', 'outline', 'ghost', 'square', 'rounded', 'pill'],
  })
  @IsOptional()
  @IsIn(['solid', 'outline', 'ghost', 'square', 'rounded', 'pill'])
  buttonStyle?: string;

  @ApiPropertyOptional({
    enum: ['minimal', 'card', 'full', 'filled', 'outlined', 'bordered'],
  })
  @IsOptional()
  @IsIn(['minimal', 'card', 'full', 'filled', 'outlined', 'bordered'])
  formStyle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showAvailability?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireDeposit?: boolean;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  title?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  subtitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentTextConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentTextConfigDto)
  benefitsTitle?: ContentTextConfigDto;

  @ApiPropertyOptional({ type: ContentButtonConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ContentButtonConfigDto)
  submitButton?: ContentButtonConfigDto;
}

// ==================== SECTIONS DTO ====================

export class SectionsConfigDto {
  @ApiPropertyOptional({ type: NavigationConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NavigationConfigDto)
  nav?: NavigationConfigDto;

  @ApiPropertyOptional({ type: HeroConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HeroConfigDto)
  hero?: HeroConfigDto;

  @ApiPropertyOptional({ type: MenuConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MenuConfigDto)
  menu?: MenuConfigDto;

  @ApiPropertyOptional({ type: InfoSectionConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InfoSectionConfigDto)
  info?: InfoSectionConfigDto;

  @ApiPropertyOptional({ type: FooterConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FooterConfigDto)
  footer?: FooterConfigDto;

  @ApiPropertyOptional({ type: CartConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CartConfigDto)
  cart?: CartConfigDto;

  @ApiPropertyOptional({ type: CheckoutConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutConfigDto)
  checkout?: CheckoutConfigDto;

  @ApiPropertyOptional({ type: OrderConfirmationConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OrderConfirmationConfigDto)
  orderConfirmation?: OrderConfirmationConfigDto;

  @ApiPropertyOptional({ type: ReservationsConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ReservationsConfigDto)
  reservations?: ReservationsConfigDto;
}

// ==================== METADATA DTO ====================

export class MetadataConfigDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  createdAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  templateName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

// ==================== RESTAURANT DRAFT DTO ====================

/**
 * DTO para la capa de borrador de datos del restaurante.
 * Todos los campos son opcionales — solo se envían los que cambiaron.
 * Al publicar, estos valores se aplican a las columnas Prisma del Restaurant.
 */
export class RestaurantDraftDto {
  @ApiPropertyOptional({ example: 'Mi Restaurante' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Restaurante de comida artesanal' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'info@mirestaurante.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+5491112345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Av. Corrientes 1234' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Buenos Aires' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 'Argentina' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'C1043' })
  @IsOptional()
  @IsString()
  postalCode?: string;

  @ApiPropertyOptional({ example: ['italiana', 'pastas'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  cuisineTypes?: string[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/logo.png' })
  @IsOptional()
  @IsString()
  logo?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/cover.jpg' })
  @IsOptional()
  @IsString()
  coverImage?: string;

  @ApiPropertyOptional({ example: 'restaurant' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'https://mirestaurante.com' })
  @IsOptional()
  @IsString()
  website?: string;

  @ApiPropertyOptional({
    example: { instagram: 'https://instagram.com/mirestaurante' },
  })
  @IsOptional()
  @IsObject()
  socialMedia?: Record<string, string>;
}

// ==================== MAIN UPDATE DTO ====================

export class UpdateBuilderConfigDto {
  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  version?: string;

  @ApiPropertyOptional({ example: '2026-03-26T12:00:00.000Z' })
  @IsOptional()
  @IsString()
  lastModified?: string;

  @ApiPropertyOptional({ type: ThemeConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ThemeConfigDto)
  theme?: ThemeConfigDto;

  @ApiPropertyOptional({ type: LayoutConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LayoutConfigDto)
  layout?: LayoutConfigDto;

  @ApiPropertyOptional({ type: AssetsConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AssetsConfigDto)
  assets?: AssetsConfigDto;

  @ApiPropertyOptional({ type: SectionsConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SectionsConfigDto)
  sections?: SectionsConfigDto;

  @ApiPropertyOptional({
    type: RestaurantDraftDto,
    description:
      'Borrador de datos del restaurante. Se aplica a DB al publicar.',
  })
  @IsOptional()
  @Transform(
    ({ value }) => {
      const normalized = normalizeRestaurantDraftPayload(value);

      if (!normalized || typeof normalized !== 'object') {
        return normalized;
      }

      return plainToInstance(RestaurantDraftDto, normalized);
    },
    {
      toClassOnly: true,
    },
  )
  @ValidateNested()
  @Type(() => RestaurantDraftDto)
  restaurant?: RestaurantDraftDto;

  @ApiPropertyOptional({ type: MobileMenuConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MobileMenuConfigDto)
  mobileMenu?: MobileMenuConfigDto;

  @ApiPropertyOptional({ type: SEOConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SEOConfigDto)
  seo?: SEOConfigDto;

  @ApiPropertyOptional({ type: AdvancedConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AdvancedConfigDto)
  advanced?: AdvancedConfigDto;

  @ApiPropertyOptional({ type: MetadataConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => MetadataConfigDto)
  metadata?: MetadataConfigDto;
}

// ==================== PUBLISH DTO ====================

export class PublishBuilderConfigDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isPublished: boolean;
}

// ==================== RESPONSE DTOs ====================

export class RestaurantInfoDto extends RestaurantDraftDto {
  @ApiProperty({ example: 'clx123abc456def' })
  declare id: string;

  @ApiProperty({ example: 'Mi Restaurante' })
  declare name: string;

  @ApiPropertyOptional({ example: 'mi-restaurante' })
  declare slug?: string;

  @ApiProperty({ example: 'info@mirestaurante.com' })
  declare email: string;

  @ApiProperty({ example: ['italiana', 'pastas'] })
  declare cuisineTypes: string[];

  @ApiPropertyOptional({ example: true })
  declare isPublished?: boolean;
}

export class BuilderPreviewBrandingDto {
  @ApiProperty({ type: ThemeConfigDto })
  declare theme: ThemeConfigDto;

  @ApiProperty({ type: LayoutConfigDto })
  declare layout: LayoutConfigDto;

  @ApiProperty({ type: AssetsConfigDto })
  declare assets: AssetsConfigDto;

  @ApiProperty({ type: SectionsConfigDto })
  declare sections: SectionsConfigDto;

  @ApiPropertyOptional({ type: MobileMenuConfigDto })
  declare mobileMenu?: MobileMenuConfigDto;

  @ApiPropertyOptional({ type: AdvancedConfigDto })
  declare advanced?: AdvancedConfigDto;
}

export class BuilderPreviewRestaurantDto extends RestaurantInfoDto {
  @ApiProperty({
    type: BuilderPreviewBrandingDto,
    description:
      'Estado efectivo de preview usado por el builder (live + draft aplicado).',
  })
  declare branding: BuilderPreviewBrandingDto;
}

export class BuilderConfigurationResponseDto extends UpdateBuilderConfigDto {
  @ApiProperty({ example: '1.0.0' })
  declare version: string;

  @ApiProperty({ example: '2026-03-26T12:00:00.000Z' })
  declare lastModified: string;

  @ApiProperty({ type: ThemeConfigDto })
  declare theme: ThemeConfigDto;

  @ApiProperty({ type: LayoutConfigDto })
  declare layout: LayoutConfigDto;

  @ApiProperty({ type: AssetsConfigDto })
  declare assets: AssetsConfigDto;

  @ApiProperty({ type: SectionsConfigDto })
  declare sections: SectionsConfigDto;
}

export class BuilderConfigResponseDto {
  @ApiProperty({
    type: BuilderConfigurationResponseDto,
    description: 'Configuracion raw persistida del builder.',
  })
  declare config: BuilderConfigurationResponseDto;

  @ApiProperty({
    type: BuilderPreviewRestaurantDto,
    description: 'Estado efectivo de preview consumido por el editor.',
  })
  declare restaurant: BuilderPreviewRestaurantDto;

  @ApiProperty({
    type: RestaurantInfoDto,
    description: 'Estado publicado/live del restaurante para referencia.',
  })
  declare publishedRestaurant: RestaurantInfoDto;
}

export class BuilderConfigEnvelopeDto {
  @ApiProperty({ example: true })
  declare success: boolean;

  @ApiProperty({ type: BuilderConfigResponseDto })
  declare data: BuilderConfigResponseDto;
}

export class BuilderPublishedConfigEnvelopeDto {
  @ApiProperty({ example: true })
  declare success: boolean;

  @ApiProperty({
    type: BuilderConfigurationResponseDto,
    description: 'Configuracion publicada expuesta al frontend publico.',
  })
  declare data: BuilderConfigurationResponseDto;
}
