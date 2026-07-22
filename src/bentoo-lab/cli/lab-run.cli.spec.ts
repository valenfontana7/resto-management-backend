import { parseOptions } from './lab-run-options';

describe('parseOptions', () => {
  it('parsea flags conocidos', () => {
    expect(
      parseOptions([
        '--scenario',
        'pizzeria-payments-15m',
        '--repetition',
        'r1',
        '--cleanup',
      ]),
    ).toEqual({
      scenarioId: 'pizzeria-payments-15m',
      repetitionKey: 'r1',
      simulatedStartAt: undefined,
      incidentCodes: undefined,
      cleanup: true,
    });
  });

  it('rechaza --help y flags desconocidos', () => {
    expect(() => parseOptions(['--help'])).toThrow(/Flags Lab desconocidos/);
    expect(() => parseOptions(['--scenario', 'x', '--foo'])).toThrow(/--foo/);
  });
});
