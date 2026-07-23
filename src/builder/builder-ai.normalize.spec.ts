import {
  normalizeComposeHomeResponse,
  normalizeImprovedCopy,
  sanitizeBlockProps,
} from './builder-ai.normalize';

describe('builder-ai.normalize', () => {
  describe('normalizeComposeHomeResponse', () => {
    it('aligns blocks to preset order and drops unknown types', () => {
      const result = normalizeComposeHomeResponse('order-online', {
        presetId: 'order-online',
        blocks: [
          {
            type: 'cta',
            props: {
              title: { text: 'Pedí ya' },
              buttonText: 'Menú',
            },
          },
          { type: 'unknown-block', props: { title: { text: 'X' } } },
          {
            type: 'hero',
            props: {
              title: { text: 'Fuego' },
              subtitle: { text: 'Pizza napolitana' },
              buttonText: 'Ver menú',
            },
          },
          { type: 'featured', props: { title: { text: 'Favoritos' } } },
          { type: 'menu', props: {} },
          { type: 'info', props: {} },
        ],
      });

      expect(result.presetId).toBe('order-online');
      expect(result.blocks.map((b) => b.type)).toEqual([
        'hero',
        'featured',
        'menu',
        'cta',
        'info',
      ]);
      expect(result.blocks[0].props.title).toEqual({ text: 'Fuego' });
      expect(result.blocks[0].props.ctaButton).toMatchObject({
        text: 'Ver menú',
        enabled: true,
      });
      expect(result.blocks[3].props.title).toEqual({ text: 'Pedí ya' });
      expect(result.blocks[3].props.buttonText).toBe('Menú');
    });

    it('fills missing blocks with safe defaults for delivery-push double cta', () => {
      const result = normalizeComposeHomeResponse('delivery-push', {
        blocks: [
          {
            type: 'hero',
            props: { title: { text: 'Casa' } },
          },
        ],
      });

      expect(result.blocks.map((b) => b.type)).toEqual([
        'hero',
        'cta',
        'menu',
        'featured',
        'faq',
        'cta',
        'info',
      ]);
      expect(result.blocks[0].props.title).toEqual({ text: 'Casa' });
      expect(result.blocks[1].props.showSection).toBe(true);
      expect(result.blocks[5].type).toBe('cta');
    });
  });

  describe('sanitizeBlockProps', () => {
    it('keeps only titles for hours/map', () => {
      const hours = sanitizeBlockProps('hours', {
        title: { text: 'Horarios' },
        body: 'Lun a Dom 12-23',
        phone: '111',
      });
      expect(hours).toEqual({
        showSection: true,
        title: { text: 'Horarios' },
      });
    });
  });

  describe('normalizeImprovedCopy', () => {
    it('reads text from object or falls back', () => {
      expect(normalizeImprovedCopy({ text: '  Hola  ' }, 'x')).toBe('Hola');
      expect(normalizeImprovedCopy({}, 'Fallback.')).toBe('Fallback.');
    });
  });
});
