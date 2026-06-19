import { OrderSource } from '@prisma/client';
import {
  getCustomerRankingKey,
  getSalonTableRankingKey,
  isSalonFloorOrder,
  SALON_PLACEHOLDER_PHONE,
} from './order-channel.util';

describe('order-channel.util', () => {
  it('detects salon floor orders', () => {
    expect(
      isSalonFloorOrder({
        orderSource: OrderSource.FLOOR_FINAL,
        tableSessionId: 'sess_1',
      }),
    ).toBe(true);
    expect(
      isSalonFloorOrder({
        orderSource: OrderSource.ONLINE,
        tableSessionId: null,
      }),
    ).toBe(false);
  });

  it('excludes salon orders from customer ranking', () => {
    expect(
      getCustomerRankingKey({
        orderSource: OrderSource.FLOOR_FINAL,
        customerPhone: SALON_PLACEHOLDER_PHONE,
        customerName: 'Mesa 1',
      }),
    ).toBeNull();
  });

  it('groups online customers by real phone', () => {
    expect(
      getCustomerRankingKey({
        orderSource: OrderSource.ONLINE,
        customerPhone: '11 2345-6789',
        customerName: 'Ana',
      }),
    ).toBe('phone:1123456789');
  });

  it('ignores placeholder phone for online-like records', () => {
    expect(
      getCustomerRankingKey({
        orderSource: OrderSource.ONLINE,
        customerPhone: SALON_PLACEHOLDER_PHONE,
        customerEmail: 'cliente@mail.com',
        customerName: 'Ana',
      }),
    ).toBe('email:cliente@mail.com');
  });

  it('ranks salon payments by table', () => {
    expect(
      getSalonTableRankingKey({
        orderSource: OrderSource.FLOOR_FINAL,
        tableId: 'table_1',
        tableSessionId: 'sess_1',
      }),
    ).toBe('table_1');
    expect(
      getSalonTableRankingKey({
        orderSource: OrderSource.FLOOR_COMANDA,
        tableId: 'table_1',
      }),
    ).toBeNull();
  });
});
