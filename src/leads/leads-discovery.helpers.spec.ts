import {
  buildLeadDedupKey,
  mergeDiscoveryCandidatePatch,
  normalizeConfidence,
  normalizeInstagramHandle,
  normalizeWebsiteUrl,
  isOnlineMenuPlatformUrl,
  parseDiscoveryResponse,
  nameSimilarity,
  findLeadDuplicateMatch,
} from './leads-discovery.helpers';

describe('leads-discovery.helpers', () => {
  it('builds dedup key from name and city', () => {
    expect(buildLeadDedupKey('La Nonna', 'Palermo')).toBe('la nonna::palermo');
    expect(buildLeadDedupKey('  La   Nonna  ', '  ')).toBe('la nonna::');
  });

  it('normalizes website URLs and FU.DO paths', () => {
    expect(normalizeWebsiteUrl('fu.do/miresto')).toBe('https://fu.do/miresto');
    expect(normalizeWebsiteUrl('https://fu.do/miresto/')).toBe(
      'https://fu.do/miresto',
    );
    expect(isOnlineMenuPlatformUrl('https://fu.do/miresto')).toBe(true);
  });

  it('normalizes confidence values', () => {
    expect(normalizeConfidence('high')).toBe('high');
    expect(normalizeConfidence('invalid')).toBe('medium');
  });

  it('normalizes instagram handles from full URLs', () => {
    expect(
      normalizeInstagramHandle('https://www.instagram.com/tres.cafe/'),
    ).toBe('tres.cafe');
    expect(normalizeInstagramHandle('@tres.cafe')).toBe('tres.cafe');
  });

  it('parses raw JSON discovery response', () => {
    const result = parseDiscoveryResponse(
      '{"searchSummary":"ok","candidates":[{"businessName":"Bar X","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":true,"whyFit":"sin web","confidence":"high"}]}',
    );
    expect(result.searchSummary).toBe('ok');
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].businessName).toBe('Bar X');
  });

  it('parses JSON wrapped in markdown fences', () => {
    const result = parseDiscoveryResponse(
      '```json\n{"searchSummary":"ok","candidates":[]}\n```',
    );
    expect(result.searchSummary).toBe('ok');
    expect(result.candidates).toEqual([]);
  });

  it('repairs trailing commas and smart quotes', () => {
    const result = parseDiscoveryResponse(
      '{"searchSummary":"Búsqueda ok", "candidates":[{"businessName":"Bar X","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":true,"whyFit":"sin web","confidence":"high",},],}',
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].businessName).toBe('Bar X');
  });

  it('repairs unescaped quotes inside whyFit strings', () => {
    const result = parseDiscoveryResponse(
      '{"searchSummary":"ok","candidates":[{"businessName":"Bar X","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":true,"whyFit":"Tiene presencia "oficial" en Instagram","confidence":"high"}]}',
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].whyFit).toContain('oficial');
  });

  it('repairs truncated JSON when output was cut by MAX_TOKENS', () => {
    const result = parseDiscoveryResponse(
      '{"searchSummary":"ok","candidates":[{"businessName":"Bar X","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":true,"whyFit":"sin web","confidence":"high"},{"businessName":"Bar Y","hasWebsite":false,"hasOnlineMenu":false,"hasReservations":false,"hasWhatsapp":false,"whyFit":"solo ig","confidence":"medium"',
    );
    expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    expect(result.candidates[0].businessName).toBe('Bar X');
  });

  it('repairs unescaped newlines inside string values', () => {
    const result = parseDiscoveryResponse(
      '{"searchSummary":"line1\nline2","candidates":[]}',
    );
    expect(result.searchSummary).toContain('line1');
  });

  it('detects fuzzy duplicate names in same city', () => {
    const match = findLeadDuplicateMatch('Pizzeria La Nonna', 'Palermo', [
      { id: '1', businessName: 'Pizzería La Nonna', city: 'Palermo' },
    ]);
    expect(match?.matchType).toBe('fuzzy');
    expect(match?.id).toBe('1');
  });

  it('scores similar names highly', () => {
    expect(nameSimilarity('La Nonna', 'La  Nonna')).toBe(1);
    expect(nameSimilarity('Cafe Martinez', 'Café Martínez')).toBeGreaterThan(
      0.9,
    );
  });

  it('mergeDiscoveryCandidatePatch recalcula score y marca corrección', () => {
    const updated = mergeDiscoveryCandidatePatch(
      {
        id: 'c-1',
        businessName: 'Bar X',
        hasWebsite: false,
        hasOnlineMenu: false,
        hasReservations: true,
        hasWhatsapp: false,
        whyFit: 'Sin web',
        confidence: 'medium',
        score: 80,
      },
      { hasWebsite: true, website: 'https://barx.com' },
    );

    expect(updated.hasWebsite).toBe(true);
    expect(updated.manuallyCorrected).toBe(true);
    expect(updated.score).toBeLessThan(80);
  });
});
