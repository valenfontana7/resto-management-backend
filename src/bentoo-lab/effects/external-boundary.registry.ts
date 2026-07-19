export type ExternalBoundaryId =
  | 'EMAIL_RESEND'
  | 'WHATSAPP_CALLMEBOT'
  | 'PUSH_WEB'
  | 'QUEUE_REDIS'
  | 'STORAGE_S3_INIT'
  | 'AI_GEMINI_INIT'
  | 'PAYMENT_MERCADOPAGO'
  | 'PAYMENT_PAYWAY'
  | 'FISCAL_ARCA'
  | 'GEOCODING_NOMINATIM'
  | 'DELIVERY_PLATFORM'
  | 'EXTERNAL_WEBHOOK';

export interface ExternalBoundaryDefinition {
  id: ExternalBoundaryId;
  initialization: 'MODULE_LOAD' | 'MODULE_INIT' | 'LAZY';
  labPolicy: 'BLOCK';
  forbiddenEnvironmentKeys: readonly string[];
  requiredAtLabStartup: boolean;
}

export const EXTERNAL_BOUNDARIES: readonly ExternalBoundaryDefinition[] = [
  {
    id: 'EMAIL_RESEND',
    initialization: 'MODULE_LOAD',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: ['RESEND_API_KEY'],
    requiredAtLabStartup: true,
  },
  {
    id: 'WHATSAPP_CALLMEBOT',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [],
    requiredAtLabStartup: true,
  },
  {
    id: 'PUSH_WEB',
    initialization: 'MODULE_INIT',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [
      'VAPID_PUBLIC_KEY',
      'VAPID_PRIVATE_KEY',
      'VAPID_SUBJECT',
    ],
    requiredAtLabStartup: true,
  },
  {
    id: 'QUEUE_REDIS',
    initialization: 'MODULE_LOAD',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: ['REDIS_URL'],
    requiredAtLabStartup: true,
  },
  {
    id: 'STORAGE_S3_INIT',
    initialization: 'MODULE_LOAD',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [
      'S3_KEY',
      'S3_SECRET',
      'S3_BUCKET',
      'S3_ENDPOINT',
      'S3_REGION',
      'S3_PUBLIC_BASE_URL',
    ],
    requiredAtLabStartup: true,
  },
  {
    id: 'AI_GEMINI_INIT',
    initialization: 'MODULE_LOAD',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: ['GEMINI_API_KEY'],
    requiredAtLabStartup: true,
  },
  {
    id: 'PAYMENT_MERCADOPAGO',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [
      'MERCADOPAGO_ACCESS_TOKEN',
      'MERCADOPAGO_PUBLIC_KEY',
      'MERCADOPAGO_OAUTH_CLIENT_ID',
      'MERCADOPAGO_OAUTH_CLIENT_SECRET',
      'MERCADOPAGO_OAUTH_STATE_SECRET',
    ],
    requiredAtLabStartup: false,
  },
  {
    id: 'PAYMENT_PAYWAY',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: ['PAYWAY_API_KEY', 'PAYWAY_SECRET_KEY'],
    requiredAtLabStartup: false,
  },
  {
    id: 'FISCAL_ARCA',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [
      'ARCA_CERT',
      'ARCA_PRIVATE_KEY',
      'AFIP_CERT',
      'AFIP_PRIVATE_KEY',
    ],
    requiredAtLabStartup: false,
  },
  {
    id: 'GEOCODING_NOMINATIM',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [],
    requiredAtLabStartup: false,
  },
  {
    id: 'DELIVERY_PLATFORM',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [],
    requiredAtLabStartup: false,
  },
  {
    id: 'EXTERNAL_WEBHOOK',
    initialization: 'LAZY',
    labPolicy: 'BLOCK',
    forbiddenEnvironmentKeys: [],
    requiredAtLabStartup: false,
  },
] as const;

export const REQUIRED_LAB_BOUNDARIES = EXTERNAL_BOUNDARIES.filter(
  (entry) => entry.requiredAtLabStartup,
).map((entry) => entry.id);

export const LAB_FORBIDDEN_ENV_KEYS = [
  ...new Set(
    EXTERNAL_BOUNDARIES.flatMap((entry) => entry.forbiddenEnvironmentKeys),
  ),
] as const;
