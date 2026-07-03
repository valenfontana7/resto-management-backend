import {
  buildLeadDemoUrl,
  parseAiJsonResponse,
  slugifyLeadDemoSlug,
} from './leads-ai.helpers';

describe('leads-ai.helpers', () => {
  it('parses JSON wrapped in markdown fences', () => {
    const result = parseAiJsonResponse<{ summary: string }>(
      '```json\n{"summary":"Demo lista"}\n```',
    );
    expect(result.summary).toBe('Demo lista');
  });

  it('builds demo url from business name', () => {
    expect(buildLeadDemoUrl('https://bentoo.com.ar', 'Arena Café')).toBe(
      'https://bentoo.com.ar/demo/arena-cafe',
    );
    expect(slugifyLeadDemoSlug('Arena Café')).toBe('arena-cafe');
  });
});
