export type OnboardingAiBusinessType =
  | 'restaurant'
  | 'cafe'
  | 'bar'
  | 'bakery'
  | 'food-truck'
  | 'other';

export interface OnboardingAiTimeRange {
  openTime: string;
  closeTime: string;
}

export interface OnboardingAiDaySchedule {
  isOpen: boolean;
  timeRanges: OnboardingAiTimeRange[];
}

export interface OnboardingAiHours {
  monday: OnboardingAiDaySchedule;
  tuesday: OnboardingAiDaySchedule;
  wednesday: OnboardingAiDaySchedule;
  thursday: OnboardingAiDaySchedule;
  friday: OnboardingAiDaySchedule;
  saturday: OnboardingAiDaySchedule;
  sunday: OnboardingAiDaySchedule;
}

export interface OnboardingAiCategoryDraft {
  id: string;
  name: string;
  description: string;
}

export interface OnboardingAiDeliveryZoneDraft {
  id: string;
  name: string;
  deliveryFee: number;
  minOrder: number;
  estimatedTime: string;
  areas: string[];
}

export interface OnboardingAiThemeDraft {
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
  };
}

export interface OnboardingAiBuilderDraft {
  restaurant?: {
    name?: string;
    description?: string;
    cuisineTypes?: string[];
    type?: string;
    address?: string;
    city?: string;
    country?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
  };
  theme?: OnboardingAiThemeDraft;
  sections?: {
    hero?: {
      title?: {
        text?: string;
      };
      description?: {
        text?: string;
      };
    };
  };
}

export interface OnboardingAiDraft {
  businessInfo: {
    restaurantName: string;
    businessType: OnboardingAiBusinessType;
    cuisine: string[];
    description: string;
  };
  contact: {
    email: string;
    phone: string;
    address: string;
    city: string;
    country: string;
    postalCode: string;
  };
  hours: OnboardingAiHours;
  menuSetup: {
    setupMethod: 'scratch';
    categories: OnboardingAiCategoryDraft[];
    estimatedDishes?: number;
  };
  paymentMethods: {
    enabledMethods: string[];
    requirePrepayment: boolean;
    acceptTips: boolean;
    tipPercentages: number[];
  };
  deliveryZones: {
    enabled: boolean;
    zones: OnboardingAiDeliveryZoneDraft[];
    freeDeliveryThreshold?: number;
    estimatedTime?: string;
  };
  builderDraft?: OnboardingAiBuilderDraft;
  assumptions: string[];
}
