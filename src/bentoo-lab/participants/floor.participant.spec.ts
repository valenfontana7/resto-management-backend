import { FloorParticipant } from './floor.participant';

describe('FloorParticipant.resolveUnpaidItemIds', () => {
  const participant = new FloorParticipant({} as never);

  it('elige el primer ítem impago (orden API)', () => {
    const ids = participant.resolveUnpaidItemIds(
      {
        id: 's1',
        sessionNumber: 'M-1',
        status: 'OPEN',
        tableId: 't1',
        total: 100,
        items: [
          {
            id: 'item-a',
            name: 'Mozza',
            kitchenStatus: 'SENT',
            paidInOrderId: null,
          },
          {
            id: 'item-b',
            name: 'Fuga',
            kitchenStatus: 'SENT',
            paidInOrderId: null,
          },
        ],
      },
      'first-unpaid',
    );
    expect(ids).toEqual(['item-a']);
  });

  it('omite ítems ya cobrados', () => {
    const ids = participant.resolveUnpaidItemIds(
      {
        id: 's1',
        sessionNumber: 'M-1',
        status: 'OPEN',
        tableId: 't1',
        total: 100,
        items: [
          {
            id: 'item-a',
            name: 'Mozza',
            kitchenStatus: 'SERVED',
            paidInOrderId: 'order-1',
          },
          {
            id: 'item-b',
            name: 'Fuga',
            kitchenStatus: 'SENT',
            paidInOrderId: null,
          },
        ],
      },
      'all-unpaid',
    );
    expect(ids).toEqual(['item-b']);
  });
});
