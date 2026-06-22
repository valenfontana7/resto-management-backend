import { buildDeliveryQuoteFailureMessage } from './delivery-quote-messages.util';

describe('delivery-quote-messages.util', () => {
  it('builds out-of-zone message with coverage hints', () => {
    const result = buildDeliveryQuoteFailureMessage({
      matchedBy: 'out-of-zone',
      zones: [
        { name: 'Centro', areas: ['Palermo', 'Recoleta'] },
        { name: 'Norte', areas: ['Belgrano'] },
      ],
      hasAddress: true,
    });

    expect(result.message).toContain('fuera de nuestra zona de entrega');
    expect(result.message).toContain('Palermo');
    expect(result.requiresZoneSelection).toBe(false);
  });

  it('asks for manual zone selection when multiple zones exist', () => {
    const result = buildDeliveryQuoteFailureMessage({
      matchedBy: 'none',
      zones: [
        { name: 'Centro', areas: ['Palermo'] },
        { name: 'Norte', areas: ['Belgrano'] },
      ],
      hasAddress: true,
    });

    expect(result.message).toContain('Seleccioná');
    expect(result.requiresZoneSelection).toBe(true);
  });
});
