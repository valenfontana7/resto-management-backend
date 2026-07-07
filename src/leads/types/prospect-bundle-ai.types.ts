/**
 * JSON schemas para las pasadas de estructuración Gemini del prospect bundle.
 * El bundle final se ensambla en `prospect-bundle-assembler.ts`.
 */

export const PROSPECT_BUSINESS_BLOCK_SCHEMA = {
  type: 'object',
  required: [
    'prospect',
    'business',
    'social',
    'businessIntelligence',
    'branding',
  ],
  properties: {
    prospect: {
      type: 'object',
      required: [
        'businessName',
        'city',
        'country',
        'sources',
        'researchedUrls',
      ],
      properties: {
        businessName: { type: 'string' },
        city: { type: 'string' },
        country: { type: 'string' },
        neighborhood: { type: 'string' },
        address: { type: 'string' },
        coordinates: {
          type: 'object',
          properties: {
            lat: { type: 'number' },
            lng: { type: 'number' },
            confidence: { type: 'number' },
          },
        },
        sources: { type: 'array', items: { type: 'string' } },
        researchedUrls: { type: 'array', items: { type: 'string' } },
      },
    },
    business: {
      type: 'object',
      required: [
        'description',
        'cuisine',
        'category',
        'openingHours',
        'services',
      ],
      properties: {
        description: { type: 'string' },
        cuisine: { type: 'array', items: { type: 'string' } },
        category: { type: 'string' },
        positioning: { type: 'string' },
        targetAudience: { type: 'array', items: { type: 'string' } },
        openingHours: {
          type: 'object',
          properties: {
            monday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
            tuesday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
            wednesday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
            thursday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
            friday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
            saturday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
            sunday: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  open: { type: 'string' },
                  close: { type: 'string' },
                },
              },
            },
          },
        },
        services: {
          type: 'object',
          properties: {
            dineIn: { type: 'boolean' },
            delivery: { type: 'boolean' },
            takeAway: { type: 'boolean' },
            reservations: { type: 'boolean' },
            retail: { type: 'boolean' },
          },
        },
        paymentMethods: { type: 'array', items: { type: 'string' } },
        cashDiscountPercent: { type: 'number' },
        rating: { type: 'number' },
        reviewCount: { type: 'number' },
        differentiators: { type: 'array', items: { type: 'string' } },
        houseRules: { type: 'array', items: { type: 'string' } },
        foundedYear: { type: 'number' },
        capacity: { type: 'number' },
      },
    },
    social: { type: 'object' },
    businessIntelligence: { type: 'object' },
    branding: {
      type: 'object',
      required: ['colorPalette'],
      properties: {
        colorPalette: {
          type: 'object',
          required: ['primary', 'primaryText', 'accent', 'background', 'text'],
          properties: {
            primary: { type: 'string' },
            primaryText: { type: 'string' },
            secondary: { type: 'string' },
            secondaryText: { type: 'string' },
            accent: { type: 'string' },
            accentText: { type: 'string' },
            background: { type: 'string' },
            surfaceMuted: { type: 'string' },
            text: { type: 'string' },
            textMuted: { type: 'string' },
            border: { type: 'string' },
            footerBackground: { type: 'string' },
            footerText: { type: 'string' },
          },
        },
        toneOfVoice: { type: 'string' },
        photographyStyle: { type: 'string' },
        personality: { type: 'array', items: { type: 'string' } },
      },
    },
    confidence: { type: 'object' },
  },
} as const;

export const PROSPECT_MENU_BLOCK_SCHEMA = {
  type: 'object',
  required: ['menu'],
  properties: {
    menu: {
      type: 'object',
      required: ['categories', 'products'],
      properties: {
        currency: { type: 'string' },
        priceSource: { type: 'string' },
        categories: {
          type: 'array',
          minItems: 3,
          items: {
            type: 'object',
            required: ['id', 'name', 'order'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              order: { type: 'number' },
            },
          },
        },
        products: {
          type: 'array',
          minItems: 8,
          items: {
            type: 'object',
            required: ['id', 'name', 'description', 'price', 'category'],
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
              price: { type: 'number' },
              category: { type: 'string' },
              ingredients: { type: 'array', items: { type: 'string' } },
              allergens: { type: 'array', items: { type: 'string' } },
              dietaryTags: { type: 'array', items: { type: 'string' } },
              spicyLevel: { type: 'number' },
              popularity: { type: 'number' },
              badges: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number' },
            },
          },
        },
      },
    },
  },
} as const;

export const PROSPECT_CONTENT_BLOCK_SCHEMA = {
  type: 'object',
  required: ['sections', 'seo'],
  properties: {
    sections: {
      type: 'object',
      required: [
        'hero',
        'featuredProducts',
        'menu',
        'about',
        'testimonials',
        'faq',
        'contact',
      ],
      properties: {
        hero: {
          type: 'object',
          properties: {
            headline: { type: 'string' },
            subheadline: { type: 'string' },
            trustSignals: { type: 'array', items: { type: 'string' } },
          },
        },
        featuredProducts: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            subtitle: { type: 'string' },
            productIds: { type: 'array', items: { type: 'string' } },
          },
        },
        about: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            body: { type: 'string' },
            highlights: { type: 'array', items: { type: 'string' } },
          },
        },
        testimonials: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  author: { type: 'string' },
                  rating: { type: 'number' },
                  text: { type: 'string' },
                  source: { type: 'string' },
                  date: { type: 'string' },
                },
              },
            },
          },
        },
        faq: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  question: { type: 'string' },
                  answer: { type: 'string' },
                },
              },
            },
          },
        },
        contact: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            address: { type: 'string' },
            phone: { type: 'string' },
            hoursSummary: { type: 'string' },
            notes: { type: 'string' },
          },
        },
      },
    },
    seo: {
      type: 'object',
      required: ['title', 'metaDescription', 'keywords'],
      properties: {
        title: { type: 'string' },
        metaDescription: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        faqSchema: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              answer: { type: 'string' },
            },
          },
        },
      },
    },
  },
} as const;

export interface ProspectBusinessBlock {
  prospect: Record<string, unknown>;
  business: Record<string, unknown>;
  social: Record<string, unknown>;
  businessIntelligence: Record<string, unknown>;
  branding: Record<string, unknown>;
  confidence?: Record<string, unknown>;
}

export interface ProspectMenuBlock {
  menu: {
    currency?: string;
    priceSource?: string;
    categories: Array<Record<string, unknown>>;
    products: Array<Record<string, unknown>>;
  };
}

export interface ProspectContentBlock {
  sections: Record<string, Record<string, unknown>>;
  seo: Record<string, unknown>;
}
