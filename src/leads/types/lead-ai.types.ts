export interface LeadBusinessDiagnosis {
  diagnosis: string;
  opportunities: string[];
  bentooBenefits: string[];
  probableObjections: string[];
  salesArguments: string[];
}

export interface LeadMessageContent {
  subject?: string;
  body: string;
  callToAction?: string;
  demoUrl?: string;
  adminDemoUrl?: string;
  channel?: LeadOutreachChannel;
  summary?: string;
}

export type LeadOutreachChannel = 'instagram' | 'whatsapp' | 'email';

export interface LeadDemoOutreachOutput {
  demoUrl: string;
  adminDemoUrl: string;
  summary: string;
  channel: LeadOutreachChannel;
  body: string;
  subject?: string;
  callToAction?: string;
}

export const LEAD_DIAGNOSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    diagnosis: { type: 'string' },
    opportunities: { type: 'array', items: { type: 'string' } },
    bentooBenefits: { type: 'array', items: { type: 'string' } },
    probableObjections: { type: 'array', items: { type: 'string' } },
    salesArguments: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'diagnosis',
    'opportunities',
    'bentooBenefits',
    'probableObjections',
    'salesArguments',
  ],
} as const;

export const LEAD_MESSAGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    subject: { type: 'string' },
    body: { type: 'string' },
    callToAction: { type: 'string' },
  },
  required: ['body'],
} as const;

export const LEAD_DEMO_SUMMARY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
  },
  required: ['summary'],
} as const;

export const LEAD_DEMO_OUTREACH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    body: { type: 'string' },
    subject: { type: 'string' },
    callToAction: { type: 'string' },
  },
  required: ['summary', 'body'],
} as const;
