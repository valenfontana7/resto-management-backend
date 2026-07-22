export interface LabRunCliOptions {
  scenarioId: string;
  repetitionKey: string;
  simulatedStartAt?: Date;
  incidentCodes?: string[];
  cleanup: boolean;
}

const LAB_RUN_FLAGS_WITH_VALUE = new Set([
  '--scenario',
  '--repetition',
  '--start-at',
  '--start',
  '--incidents',
]);

const LAB_RUN_FLAGS_BOOLEAN = new Set(['--cleanup']);

export function parseOptions(argv: string[]): LabRunCliOptions {
  const unknown: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      unknown.push(token);
      continue;
    }
    if (LAB_RUN_FLAGS_BOOLEAN.has(token)) {
      continue;
    }
    if (LAB_RUN_FLAGS_WITH_VALUE.has(token)) {
      index += 1;
      continue;
    }
    unknown.push(token);
  }
  if (unknown.length > 0) {
    throw new Error(
      `Flags Lab desconocidos: ${unknown.join(', ')}. Usá --scenario, --repetition, --start-at, --incidents, --cleanup.`,
    );
  }

  const read = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const start = read('--start-at') ?? read('--start');
  const incidentsRaw = read('--incidents');
  return {
    scenarioId: read('--scenario') ?? 'pizzeria-30m',
    repetitionKey: read('--repetition') ?? 'viernes-42',
    simulatedStartAt: start ? new Date(start) : undefined,
    incidentCodes:
      incidentsRaw === undefined
        ? undefined
        : incidentsRaw
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean),
    cleanup: argv.includes('--cleanup'),
  };
}
