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
