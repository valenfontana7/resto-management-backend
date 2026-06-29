import { formatOrderStatusLabel } from './order-status-labels';
import { OrderStatus } from '../../orders/dto/order.dto';

describe('formatOrderStatusLabel', () => {
  it('returns Spanish labels', () => {
    expect(formatOrderStatusLabel(OrderStatus.PREPARING)).toBe(
      'En preparación',
    );
    expect(formatOrderStatusLabel('READY')).toBe('Listo');
  });

  it('supports lowercase sentence form', () => {
    expect(
      formatOrderStatusLabel(OrderStatus.PREPARING, { sentenceCase: false }),
    ).toBe('en preparación');
  });
});
