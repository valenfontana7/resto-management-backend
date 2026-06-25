export type LeadDiscoveryConfidence = 'high' | 'medium' | 'low';

export interface LeadDiscoveryCandidateRaw {
  businessName: string;
  category?: string;
  city?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  hasWebsite: boolean;
  hasOnlineMenu: boolean;
  hasReservations: boolean;
  hasWhatsapp: boolean;
  whyFit: string;
  confidence: LeadDiscoveryConfidence;
  sourceUrl?: string;
}

export interface LeadDiscoveryCandidate extends LeadDiscoveryCandidateRaw {
  score: number;
  id: string;
}

export type LeadDiscoveryStatus = 'success' | 'empty' | 'unavailable' | 'error';

export type LeadDiscoveryErrorCode =
  | 'GEMINI_UNAVAILABLE'
  | 'GEMINI_FAILED'
  | 'PARSE_FAILED'
  | 'QUOTA_EXCEEDED';

export interface LeadDiscoveryResult {
  searchSummary: string;
  candidates: LeadDiscoveryCandidate[];
  sources: string[];
  sessionId: string;
  status: LeadDiscoveryStatus;
  errorCode?: LeadDiscoveryErrorCode;
  errorMessage?: string;
}

export interface ImportLeadsSkipped {
  businessName: string;
  city?: string;
  reason: 'duplicate' | 'invalid' | 'fuzzy_duplicate';
}

export interface ImportLeadsResult {
  created: unknown[];
  skipped: ImportLeadsSkipped[];
}

export interface CheckImportDuplicateResultItem {
  id: string;
  businessName: string;
  city?: string;
  isDuplicate: boolean;
  existingLeadId?: string;
  matchType?: 'exact' | 'fuzzy';
  matchScore?: number;
}

export interface CheckImportDuplicatesResult {
  items: CheckImportDuplicateResultItem[];
}

export const LEAD_DISCOVERY_JSON_SCHEMA = {
  type: 'object',
  properties: {
    searchSummary: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          businessName: { type: 'string' },
          category: { type: 'string' },
          city: { type: 'string' },
          website: { type: 'string' },
          instagram: { type: 'string' },
          whatsapp: { type: 'string' },
          hasWebsite: { type: 'boolean' },
          hasOnlineMenu: { type: 'boolean' },
          hasReservations: { type: 'boolean' },
          hasWhatsapp: { type: 'boolean' },
          whyFit: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          sourceUrl: { type: 'string' },
        },
        required: [
          'businessName',
          'hasWebsite',
          'hasOnlineMenu',
          'hasReservations',
          'hasWhatsapp',
          'whyFit',
          'confidence',
        ],
      },
    },
  },
  required: ['searchSummary', 'candidates'],
} as const;
