import { BundleBranding } from '../types';
import { MappedMedia } from './media';
import { MappedThemeTokens } from './theme';

/**
 * Construye el BrandingConfig del payload demo (mismo shape que consume
 * el frontend en `types/restaurant.ts` → BrandingConfig).
 */
export function mapBranding(
  branding: BundleBranding,
  theme: MappedThemeTokens,
  media: MappedMedia,
): Record<string, unknown> {
  const palette = branding.colorPalette;
  const logo = branding.logo
    ? (media.urlById.get(branding.logo.mediaId) ?? null)
    : null;
  const cover =
    media.urlById.get('media-hero') ?? findFirstByType(media, 'hero');

  const surfaceMuted = palette.surfaceMuted ?? '#f8fafc';
  const border = palette.border ?? '#e2e8f0';
  const text = palette.text ?? '#0f172a';
  const textMuted = palette.textMuted ?? '#475569';

  return {
    theme: {
      colors: {
        primary: palette.primary,
        primaryText: palette.primaryText ?? '#ffffff',
        secondary: palette.secondary ?? '#64748b',
        secondaryText: palette.secondaryText ?? '#ffffff',
        accent: palette.accent ?? palette.primary,
        accentText: palette.accentText ?? '#ffffff',
        background: palette.background ?? '#ffffff',
        text,
      },
      typography: {
        fontFamily: branding.typography.bodyFont,
        headingFontFamily: branding.typography.headingFont,
        fontSize: branding.typography.baseSize ?? 'md',
      },
      spacing: {
        borderRadius: theme.borderRadius,
        cardShadow: theme.cardShadow,
      },
    },
    assets: {
      logo,
      favicon: null,
      coverImage: cover ?? null,
      bannerImage: cover ?? null,
    },
    layout: {
      menuStyle: theme.menuStyle,
      categoryDisplay: theme.categoryDisplay,
      showHeroSection: true,
      showStats: false,
      showHighlights: false,
      showTestimonials: true,
      compactMode: false,
      maxWidth: theme.maxWidth,
    },
    sections: {
      nav: {
        backgroundColor: palette.background ?? '#ffffff',
        textColor: text,
        titleColor: text,
        logoSize: 'md',
        transparency: false,
        blur: false,
        showOpenStatus: true,
        showContactButton: true,
        cuisineTypesColor: palette.primary,
      },
      hero: {
        titleColor: '#ffffff',
        descriptionColor: '#f5f5f4',
        metaTextColor: 'rgba(255,255,255,0.88)',
        textShadow: true,
        textAlign: 'left',
        overlay: {
          enabled: true,
          color: theme.heroOverlayColor,
          opacity: theme.heroOverlayOpacity,
        },
        showCuisineTypes: true,
        cuisineTypesStyle: 'soft',
        cuisineTypesColor: '#ffffff',
        cuisineTypesBackgroundColor: 'rgba(255,255,255,0.14)',
        cuisineTypesBorderColor: 'rgba(255,255,255,0.28)',
      },
      menu: {
        backgroundColor: palette.background ?? '#ffffff',
        textColor: text,
        cardBackgroundColor: palette.background ?? '#ffffff',
        cardBorderColor: border,
        categoryTabColor: textMuted,
        categoryTabActiveColor: palette.primary,
      },
      footer: {
        backgroundColor: palette.footerBackground ?? '#0f172a',
        textColor: palette.footerText ?? '#ffffff',
        linkColor: palette.footerText ?? '#d6d3d1',
        linkHoverColor: '#ffffff',
      },
      cart: {
        backgroundColor: palette.background ?? '#ffffff',
        textColor: text,
        summaryBackgroundColor: surfaceMuted,
        summaryTextColor: text,
      },
      checkout: {
        backgroundColor: palette.background ?? '#ffffff',
        textColor: text,
        formBackgroundColor: palette.background ?? '#ffffff',
        sidebarBackgroundColor: surfaceMuted,
      },
      reservations: {
        backgroundColor: palette.background ?? '#ffffff',
        textColor: text,
      },
    },
  };
}

function findFirstByType(media: MappedMedia, type: string): string | undefined {
  const entry = media.manifest.find((image) => image.type === type);
  return entry?.url;
}
