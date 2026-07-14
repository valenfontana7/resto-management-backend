import { buildProspectImagePlaceholder } from './lead-prospect-image-placeholder';

describe('buildProspectImagePlaceholder', () => {
  it('returns a valid JPEG without relying on system fonts', async () => {
    const buffer = await buildProspectImagePlaceholder('#c45a28');
    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });

  it('falls back to default brand color for invalid hex', async () => {
    const buffer = await buildProspectImagePlaceholder('not-a-color');
    expect(buffer[0]).toBe(0xff);
    expect(buffer[1]).toBe(0xd8);
  });
});
