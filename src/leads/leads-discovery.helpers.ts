import { randomUUID } from 'crypto';
import type { DiscoverLeadsDto } from './dto/discover-leads.dto';
import type {
  LeadDiscoveryCandidate,
  LeadDiscoveryCandidateRaw,
  LeadDiscoveryConfidence,
} from './types/lead-discovery.types';
import {
  buildScoringInputFromLead,
  calculateLeadScore,
} from './lead-scoring.rules';

export function buildLeadDedupKey(
  businessName: string,
  city?: string | null,
): string {
  const name = businessName.trim().toLowerCase().replace(/\s+/g, ' ');
  const c = (city ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return `${name}::${c}`;
}

export function normalizeLeadName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ExistingLeadRef {
  id: string;
  businessName: string;
  city?: string | null;
}

export interface LeadDuplicateMatch {
  id: string;
  matchType: 'exact' | 'fuzzy';
  score: number;
}

const FUZZY_DUPLICATE_THRESHOLD = 0.88;

export function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0),
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[a.length][b.length];
}

export function nameSimilarity(a: string, b: string): number {
  const left = normalizeLeadName(a);
  const right = normalizeLeadName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const distance = levenshteinDistance(left, right);
  const maxLen = Math.max(left.length, right.length);
  return maxLen === 0 ? 0 : 1 - distance / maxLen;
}

export function findLeadDuplicateMatch(
  businessName: string,
  city: string | undefined | null,
  existing: ExistingLeadRef[],
): LeadDuplicateMatch | null {
  const trimmedName = businessName?.trim();
  if (!trimmedName) return null;

  const exactKey = buildLeadDedupKey(trimmedName, city);
  for (const lead of existing) {
    if (buildLeadDedupKey(lead.businessName, lead.city) === exactKey) {
      return { id: lead.id, matchType: 'exact', score: 1 };
    }
  }

  const normCity = (city ?? '').trim().toLowerCase();
  let best: LeadDuplicateMatch | null = null;

  for (const lead of existing) {
    const leadCity = (lead.city ?? '').trim().toLowerCase();
    if (normCity && leadCity && normCity !== leadCity) continue;

    const score = nameSimilarity(trimmedName, lead.businessName);
    if (score >= FUZZY_DUPLICATE_THRESHOLD) {
      if (!best || score > best.score) {
        best = { id: lead.id, matchType: 'fuzzy', score };
      }
    }
  }

  return best;
}

/** Handle limpio para guardar y mostrar (sin URL ni @). */
export function normalizeInstagramHandle(
  value?: string | null,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (/instagram\.com/i.test(trimmed)) {
    const withProtocol = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    try {
      const url = new URL(withProtocol);
      const segments = url.pathname.split('/').filter(Boolean);
      const handle = segments[0];
      if (
        handle &&
        handle !== 'p' &&
        handle !== 'reel' &&
        handle !== 'stories'
      ) {
        return handle;
      }
    } catch {
      /* fall through */
    }
  }

  const handle = trimmed
    .replace(/^@/, '')
    .replace(/^\/+/, '')
    .split('/')
    .filter(Boolean)[0];

  return handle || undefined;
}

export function buildDiscoveryPrompt(dto: DiscoverLeadsDto): string {
  const maxResults = dto.maxResults ?? 10;
  const parts = [
    `Busca prospectos comerciales (restaurantes, bares, cafeterías, delivery) en Argentina.`,
    `Consulta del usuario: ${dto.query.trim()}`,
  ];
  if (dto.city?.trim()) parts.push(`Ciudad/zona preferida: ${dto.city.trim()}`);
  if (dto.category?.trim())
    parts.push(`Categoría preferida: ${dto.category.trim()}`);
  parts.push(
    `Devuelve hasta ${maxResults} negocios REALES encontrados en la web.`,
    `Para cada uno indica si tiene sitio web propio, menú online, reservas online y WhatsApp comercial.`,
    `Incluye whyFit breve (máximo 80 caracteres, sin saltos de línea) explicando por qué serían buenos clientes para Bentoo (SaaS de restaurantes: web, menú digital, pedidos, reservas, MercadoPago).`,
    `confidence: high si hay datos claros de la web, medium si parcial, low si inferido.`,
    `sourceUrl: URL de referencia si está disponible.`,
    `instagram: solo el usuario/handle (ej: tres.cafe o @tres.cafe), sin URL completa de instagram.com.`,
    `No inventes negocios. Si no encontrás suficientes, devuelve menos candidatos.`,
    '',
    'Respondé ÚNICAMENTE con JSON válido (sin markdown, sin texto extra, sin null — usá "" para campos vacíos) con esta forma:',
    '{"searchSummary":"...","candidates":[{"businessName":"...","category":"...","city":"...","website":"...","instagram":"...","whatsapp":"...","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":false,"whyFit":"...","confidence":"high|medium|low","sourceUrl":"..."}]}',
  );
  return parts.join('\n');
}

export class LeadDiscoveryParseError extends Error {
  constructor(
    message: string,
    readonly rawPreview?: string,
  ) {
    super(message);
    this.name = 'LeadDiscoveryParseError';
  }
}

function extractJsonObject(raw: string): string {
  const trimmed = raw.trim();
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function sanitizeJsonLikeString(jsonStr: string): string {
  return jsonStr
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/\r\n/g, '\n')
    .replace(/\bnull\b/g, '""');
}

/** Reemplaza saltos de línea / tabs sin escapar dentro de strings JSON. */
function escapeControlCharsInJsonStrings(input: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      result.push(ch);
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      result.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      result.push(ch);
      inString = false;
      continue;
    }

    if (ch === '\n' || ch === '\r' || ch === '\t') {
      result.push(' ');
      continue;
    }

    if (ch.charCodeAt(0) < 0x20) {
      continue;
    }

    result.push(ch);
  }

  return result.join('');
}

/** Cierra arrays/objetos abiertos cuando Gemini trunca por MAX_TOKENS. */
function closeTruncatedJson(jsonStr: string): string {
  let inString = false;
  let escaped = false;
  let openBraces = 0;
  let openBrackets = 0;

  for (let i = 0; i < jsonStr.length; i++) {
    const ch = jsonStr[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') openBraces++;
    if (ch === '}') openBraces--;
    if (ch === '[') openBrackets++;
    if (ch === ']') openBrackets--;
  }

  let closed = jsonStr.trimEnd();
  if (inString) closed += '"';
  while (openBrackets > 0) {
    closed += ']';
    openBrackets--;
  }
  while (openBraces > 0) {
    closed += '}';
    openBraces--;
  }
  return closed;
}

export function buildStructureDiscoveryPrompt(
  rawResearch: string,
  maxResults: number,
): string {
  return [
    `Convertí la siguiente investigación comercial en JSON estricto.`,
    `Máximo ${maxResults} candidatos. Campos vacíos como "" (no null). whyFit máximo 80 caracteres.`,
    'Formato: {"searchSummary":"...","candidates":[{"businessName":"...","category":"...","city":"...","website":"...","instagram":"...","whatsapp":"...","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":false,"whyFit":"...","confidence":"high|medium|low","sourceUrl":"..."}]}',
    '',
    'Investigación:',
    rawResearch.slice(0, 14_000),
  ].join('\n');
}

/**
 * Escapa comillas internas sin escapar que Gemini suele insertar en whyFit/searchSummary.
 */
function repairUnescapedQuotesInJsonStrings(input: string): string {
  const result: string[] = [];
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (!inString) {
      result.push(ch);
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      result.push(ch);
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      result.push(ch);
      escaped = true;
      continue;
    }

    if (ch === '"') {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j])) j++;
      const next = input[j];
      if (
        next === ',' ||
        next === '}' ||
        next === ']' ||
        next === ':' ||
        next === undefined
      ) {
        result.push(ch);
        inString = false;
      } else {
        result.push('\\', '"');
      }
      continue;
    }

    result.push(ch);
  }

  return result.join('');
}

function tryParseDiscoveryJson(jsonStr: string): {
  searchSummary?: string;
  candidates?: LeadDiscoveryCandidateRaw[];
} | null {
  const sanitized = sanitizeJsonLikeString(jsonStr);
  const attempts = [
    jsonStr,
    sanitized,
    repairUnescapedQuotesInJsonStrings(sanitized),
    escapeControlCharsInJsonStrings(
      repairUnescapedQuotesInJsonStrings(sanitized),
    ),
    closeTruncatedJson(
      escapeControlCharsInJsonStrings(
        repairUnescapedQuotesInJsonStrings(sanitized),
      ),
    ),
  ];

  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as {
        searchSummary?: string;
        candidates?: LeadDiscoveryCandidateRaw[];
      };
    } catch {
      /* try next repair pass */
    }
  }

  return null;
}

export function parseDiscoveryResponse(raw: string): {
  searchSummary: string;
  candidates: LeadDiscoveryCandidateRaw[];
} {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new LeadDiscoveryParseError('Empty Gemini discovery response');
  }

  const jsonStr = extractJsonObject(trimmed);
  const parsed = tryParseDiscoveryJson(jsonStr);

  if (!parsed) {
    throw new LeadDiscoveryParseError(
      'Invalid JSON in Gemini discovery response',
      jsonStr.slice(0, 400),
    );
  }

  return {
    searchSummary: parsed.searchSummary?.trim() || 'Búsqueda completada',
    candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
  };
}

export function extractGroundingSources(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== 'object') return [];
  const chunks = (metadata as { groundingChunks?: unknown[] }).groundingChunks;
  if (!Array.isArray(chunks)) return [];

  const urls = new Set<string>();
  for (const chunk of chunks) {
    if (!chunk || typeof chunk !== 'object') continue;
    const web = (chunk as { web?: { uri?: string } }).web;
    if (web?.uri) urls.add(web.uri);
  }
  return [...urls];
}

export function normalizeConfidence(value: unknown): LeadDiscoveryConfidence {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'medium';
}

export function enrichDiscoveryCandidates(
  raw: LeadDiscoveryCandidateRaw[],
): LeadDiscoveryCandidate[] {
  return raw.map((candidate) => {
    const score = calculateLeadScore(
      buildScoringInputFromLead({
        hasWebsite: candidate.hasWebsite ?? false,
        hasOnlineMenu: candidate.hasOnlineMenu ?? false,
        hasReservations: candidate.hasReservations ?? false,
        hasWhatsapp:
          candidate.hasWhatsapp ?? Boolean(candidate.whatsapp?.trim()),
        instagram: candidate.instagram,
        branchCount: 1,
      }),
    );

    return {
      ...candidate,
      instagram: normalizeInstagramHandle(candidate.instagram),
      id: randomUUID(),
      confidence: normalizeConfidence(candidate.confidence),
      score,
    };
  });
}

export function toCreateLeadFromCandidate(
  candidate: LeadDiscoveryCandidateRaw,
): {
  businessName: string;
  category?: string;
  city?: string;
  website?: string;
  instagram?: string;
  whatsapp?: string;
  email?: string;
  phone?: string;
  hasWebsite: boolean;
  hasOnlineMenu: boolean;
  hasReservations: boolean;
  hasWhatsapp: boolean;
  notes?: string;
} {
  return {
    businessName: candidate.businessName.trim(),
    category: candidate.category?.trim() || undefined,
    city: candidate.city?.trim() || undefined,
    website: candidate.website?.trim() || undefined,
    instagram: normalizeInstagramHandle(candidate.instagram),
    whatsapp: candidate.whatsapp?.trim() || undefined,
    email: candidate.email?.trim() || undefined,
    phone: candidate.phone?.trim() || undefined,
    hasWebsite: candidate.hasWebsite ?? false,
    hasOnlineMenu: candidate.hasOnlineMenu ?? false,
    hasReservations: candidate.hasReservations ?? false,
    hasWhatsapp: candidate.hasWhatsapp ?? Boolean(candidate.whatsapp?.trim()),
    notes: candidate.whyFit
      ? `Descubierto con IA: ${candidate.whyFit}`
      : undefined,
  };
}

export function mergeDiscoveryCandidatePatch(
  existing: LeadDiscoveryCandidate,
  patch: Partial<LeadDiscoveryCandidateRaw>,
): LeadDiscoveryCandidate {
  const merged: LeadDiscoveryCandidate = {
    ...existing,
    ...patch,
    id: existing.id,
    hasWhatsapp:
      patch.hasWhatsapp ??
      existing.hasWhatsapp ??
      Boolean((patch.whatsapp ?? existing.whatsapp)?.trim()),
    hasWebsite:
      patch.hasWebsite ??
      existing.hasWebsite ??
      Boolean((patch.website ?? existing.website)?.trim()),
    manuallyCorrected: true,
    correctedAt: new Date().toISOString(),
  };

  const [enriched] = enrichDiscoveryCandidates([merged]);
  return { ...enriched, id: existing.id };
}
