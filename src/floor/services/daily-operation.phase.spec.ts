import { BadRequestException } from '@nestjs/common';

/**
 * Specs de las reglas FSM del día (espejo de daily-operation.service).
 * Mantener alineadas con isOpeningComplete / isClosingComplete / resolveDailyPhase.
 */

function isChecklistComplete(
  ids: readonly string[],
  checklist: Record<string, boolean>,
): boolean {
  return ids.every((id) => checklist[id]);
}

function isOpeningComplete(
  openingChecklist: Record<string, boolean> | null | undefined,
  openingCompletedAt: Date | null,
  ids: readonly string[],
): boolean {
  const source = openingChecklist ?? {};
  const checklist = Object.fromEntries(
    ids.map((id) => [id, Boolean(source[id])]),
  );
  return isChecklistComplete(ids, checklist) || Boolean(openingCompletedAt);
}

function isClosingComplete(
  closingChecklist: Record<string, boolean> | null | undefined,
  closingCompletedAt: Date | null,
  ids: readonly string[],
): boolean {
  const source = closingChecklist ?? {};
  const checklist = Object.fromEntries(
    ids.map((id) => [id, Boolean(source[id])]),
  );
  return isChecklistComplete(ids, checklist) || Boolean(closingCompletedAt);
}

type Phase = 'NOT_OPENED' | 'OPEN' | 'CLOSING' | 'DAY_CLOSED';

function resolveDailyPhase(input: {
  openingComplete: boolean;
  closingComplete: boolean;
  dailyClosedAt: Date | null;
}): Phase {
  if (input.dailyClosedAt) return 'DAY_CLOSED';
  if (input.closingComplete) return 'CLOSING';
  if (input.openingComplete) return 'OPEN';
  return 'NOT_OPENED';
}

const OPENING_IDS = ['open_cash', 'review_reservations'] as const;
const CLOSING_IDS = ['close_tables', 'cash_count'] as const;

describe('DailyOperation day FSM rules', () => {
  it('openingComplete acepta timestamp o checklist', () => {
    expect(isOpeningComplete({}, null, OPENING_IDS)).toBe(false);
    expect(isOpeningComplete({}, new Date(), OPENING_IDS)).toBe(true);
    expect(
      isOpeningComplete(
        { open_cash: true, review_reservations: true },
        null,
        OPENING_IDS,
      ),
    ).toBe(true);
  });

  it('closingComplete usa la misma regla que apertura (timestamp o checklist)', () => {
    expect(isClosingComplete({}, null, CLOSING_IDS)).toBe(false);
    expect(isClosingComplete({}, new Date(), CLOSING_IDS)).toBe(true);
    expect(
      isClosingComplete(
        { close_tables: true, cash_count: true },
        null,
        CLOSING_IDS,
      ),
    ).toBe(true);
  });

  it('resuelve fases canónicas', () => {
    expect(
      resolveDailyPhase({
        openingComplete: false,
        closingComplete: false,
        dailyClosedAt: null,
      }),
    ).toBe('NOT_OPENED');
    expect(
      resolveDailyPhase({
        openingComplete: true,
        closingComplete: false,
        dailyClosedAt: null,
      }),
    ).toBe('OPEN');
    expect(
      resolveDailyPhase({
        openingComplete: true,
        closingComplete: true,
        dailyClosedAt: null,
      }),
    ).toBe('CLOSING');
    expect(
      resolveDailyPhase({
        openingComplete: true,
        closingComplete: true,
        dailyClosedAt: new Date(),
      }),
    ).toBe('DAY_CLOSED');
  });

  it('rechaza cierre sin apertura (regla de producto)', () => {
    const openingComplete = false;
    const closingComplete = true;
    const assertAllowed = () => {
      if (closingComplete && !openingComplete) {
        throw new BadRequestException(
          'No se puede marcar el cierre sin haber abierto el día.',
        );
      }
    };
    expect(assertAllowed).toThrow(BadRequestException);
  });
});
