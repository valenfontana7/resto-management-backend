import { BundleBuilder } from '../types';

export interface MappedNavigation {
  items: Array<{ label: string; target: string }>;
  ctaButton: { label: string; target: string } | null;
  showOpenStatus: boolean;
  homepageSectionOrder: string[];
  routes: Array<{ path: string; type: string }>;
}

export function mapNavigation(builder: BundleBuilder): MappedNavigation {
  return {
    items: builder.navigation.items.map((item) => ({
      label: item.label.trim(),
      target: item.target,
    })),
    ctaButton: builder.navigation.ctaButton ?? null,
    showOpenStatus: builder.navigation.showOpenStatus ?? true,
    homepageSectionOrder: builder.homepageSectionOrder,
    routes: builder.routes.map((route) => ({
      path: route.path,
      type: route.type,
    })),
  };
}
