import {
  canUserCollectOnFloor,
  getSalonStaffSeparationMode,
  mergeSalonStaffSeparation,
} from './salon-staff-separation.util';

describe('salon-staff-separation.util', () => {
  it('defaults to unified mode', () => {
    expect(getSalonStaffSeparationMode(null)).toBe('unified');
    expect(getSalonStaffSeparationMode({})).toBe('unified');
  });

  it('reads separated mode from businessRules', () => {
    expect(
      getSalonStaffSeparationMode({ salon: { staffSeparation: 'separated' } }),
    ).toBe('separated');
  });

  it('merges staffSeparation into businessRules', () => {
    expect(
      mergeSalonStaffSeparation(
        { payment: { methods: ['cash'] } },
        'separated',
      ),
    ).toEqual({
      payment: { methods: ['cash'] },
      salon: { staffSeparation: 'separated' },
    });
  });

  it('allows waiter to collect in unified mode', () => {
    expect(
      canUserCollectOnFloor('WAITER', ['dashboard', 'salon', 'cashier'], {
        salon: { staffSeparation: 'unified' },
      }),
    ).toBe(true);
  });

  it('blocks waiter from collecting in separated mode', () => {
    expect(
      canUserCollectOnFloor('WAITER', ['dashboard', 'salon', 'cashier'], {
        salon: { staffSeparation: 'separated' },
      }),
    ).toBe(false);
  });

  it('allows cashier in separated mode', () => {
    expect(
      canUserCollectOnFloor('CASHIER', ['dashboard', 'salon', 'cashier'], {
        salon: { staffSeparation: 'separated' },
      }),
    ).toBe(true);
  });

  it('allows manager in both modes', () => {
    const rules = { salon: { staffSeparation: 'separated' } };
    expect(canUserCollectOnFloor('MANAGER', ['salon', 'cashier'], rules)).toBe(
      true,
    );
  });
});
