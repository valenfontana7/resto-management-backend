import { BundleTheme } from '../types';

export interface MappedThemeTokens {
  borderRadius: string;
  cardShadow: boolean;
  menuStyle: string;
  categoryDisplay: string;
  maxWidth: string;
  heroOverlayOpacity: number;
  heroOverlayColor: string;
  /** Tokens completos preservados para el editor. */
  raw: BundleTheme;
}

export function mapTheme(theme: BundleTheme): MappedThemeTokens {
  return {
    borderRadius: theme.borderRadius ?? 'md',
    cardShadow: theme.shadows !== 'none',
    menuStyle: theme.menuLayout ?? 'grid',
    categoryDisplay: theme.categoryDisplay ?? 'tabs',
    maxWidth: theme.maxWidth ?? 'xl',
    heroOverlayOpacity: theme.heroOverlay?.opacity ?? 50,
    heroOverlayColor: theme.heroOverlay?.color ?? '#000000',
    raw: theme,
  };
}
