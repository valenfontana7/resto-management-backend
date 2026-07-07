export const SALES_PACKAGE_JSON_SCHEMA = {
  type: 'object',
  required: [
    'executiveSummary',
    'pitch',
    'beforeAfter',
    'improvementReport',
    'premiumOpportunities',
    'objectionHandling',
    'businessImpact',
    'callToAction',
    'sellerChecklist',
  ],
  properties: {
    executiveSummary: { type: 'string' },
    pitch: { type: 'string' },
    beforeAfter: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dimension: { type: 'string' },
          today: { type: 'string' },
          withBentoo: { type: 'string' },
        },
      },
    },
    improvementReport: {
      type: 'object',
      properties: {
        branding: { type: 'string' },
        navigation: { type: 'string' },
        images: { type: 'string' },
        menu: { type: 'string' },
        seo: { type: 'string' },
        mobile: { type: 'string' },
        trust: { type: 'string' },
        conversion: { type: 'string' },
        presentation: { type: 'string' },
      },
    },
    premiumOpportunities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          roi: { type: 'string' },
          priority: { type: 'number' },
        },
      },
    },
    objectionHandling: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          objection: { type: 'string' },
          answer: { type: 'string' },
        },
      },
    },
    businessImpact: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          estimate: { type: 'string' },
          confidence: { type: 'number' },
          basis: { type: 'string' },
        },
      },
    },
    callToAction: { type: 'string' },
    sellerChecklist: { type: 'array', items: { type: 'string' } },
  },
} as const;

export interface SalesPackageContent {
  executiveSummary: string;
  pitch: string;
  beforeAfter: Array<{ dimension: string; today: string; withBentoo: string }>;
  improvementReport: Record<string, string>;
  premiumOpportunities: Array<{ title: string; roi: string; priority: number }>;
  objectionHandling: Array<{ objection: string; answer: string }>;
  businessImpact: Array<{
    area: string;
    estimate: string;
    confidence: number;
    basis: string;
  }>;
  callToAction: string;
  sellerChecklist: string[];
  generatedAt: string;
  markdown?: string;
}
