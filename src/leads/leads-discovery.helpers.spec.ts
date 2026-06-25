import {
  buildLeadDedupKey,
  normalizeConfidence,
  parseDiscoveryResponse,
  nameSimilarity,
  findLeadDuplicateMatch,
} from './leads-discovery.helpers';

describe('leads-discovery.helpers', () => {
  it('builds dedup key from name and city', () => {
    expect(buildLeadDedupKey('La Nonna', 'Palermo')).toBe('la nonna::palermo');
    expect(buildLeadDedupKey('  La   Nonna  ', '  ')).toBe('la nonna::');
  });

  it('normalizes confidence values', () => {
    expect(normalizeConfidence('high')).toBe('high');
    expect(normalizeConfidence('invalid')).toBe('medium');
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
});
