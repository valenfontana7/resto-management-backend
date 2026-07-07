import { ProspectBundle } from '../types';

export interface MappedSettings {
  features: string[];
  ordering: Record<string, unknown>;
  reservations: Record<string, unknown>;
  paymentMethods: string[];
  cashDiscountPercent: number | null;
  houseRules: string[];
  languages: string[];
  currency: string;
}

const SERVICE_LABELS: Record<string, string> = {
  delivery: 'Delivery',
  takeAway: 'Take away',
  dineIn: 'Salón',
  reservations: 'Reservas',
  catering: 'Catering',
  events: 'Eventos',
  giftCards: 'Gift cards',
  retail: 'Productos para llevar',
};

export function mapSettings(bundle: ProspectBundle): MappedSettings {
  const { business, builder, menu } = bundle;

  const features = Object.entries(business.services)
    .filter(([, enabled]) => enabled)
    .map(([service]) => SERVICE_LABELS[service])
    .filter((label): label is string => Boolean(label));

  if (business.cashDiscountPercent) {
    features.push(`${business.cashDiscountPercent}% de descuento en efectivo`);
  }

  return {
    features,
    ordering: builder.orderingConfiguration ?? {
      delivery: { enabled: business.services.delivery ?? false },
      pickup: { enabled: business.services.takeAway ?? false },
      dineIn: { enabled: business.services.dineIn ?? true },
    },
    reservations: builder.reservationConfiguration ?? {
      enabled: business.services.reservations ?? false,
    },
    paymentMethods: business.paymentMethods ?? ['cash'],
    cashDiscountPercent: business.cashDiscountPercent ?? null,
    houseRules: business.houseRules ?? [],
    languages: business.languages ?? ['es'],
    currency: menu.currency,
  };
}
