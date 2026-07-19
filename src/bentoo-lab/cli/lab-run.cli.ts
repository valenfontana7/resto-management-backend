import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AddressInfo } from 'node:net';
import { AppModule } from '../../app.module';
import { normalizeTimeline } from '../core/timeline-normalizer';
import { canonicalizeLabIncidents } from '../incidents/lab-incident.types';
import { LabHttpTransport } from '../http/lab-http.transport';
import { SimulationRuntimeService } from '../runtime/simulation-runtime.service';
import { SimulationTimelineService } from '../timeline/simulation-timeline.service';

interface CliOptions {
  scenarioId: string;
  repetitionKey: string;
  simulatedStartAt?: Date;
  incidentCodes?: string[];
  cleanup: boolean;
}

export async function runLabHeadless(options: CliOptions) {
  const realStartedAt = Date.now();
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as AddressInfo;
  app.get(LabHttpTransport).configure(address.port);

  try {
    const runtime = app.get(SimulationRuntimeService);
    const incidentCodes = canonicalizeLabIncidents(options.incidentCodes);
    const run = await runtime.runHeadless({
      scenarioId: options.scenarioId,
      repetitionKey: options.repetitionKey,
      simulatedStartAt: options.simulatedStartAt,
      incidentCodes,
    });
    const timeline = await app.get(SimulationTimelineService).list(run.id);
    const failedInvariant = Array.isArray(run.invariantResults)
      ? run.invariantResults.some(
          (result: { status?: string }) => result.status !== 'PASS',
        )
      : false;
    const result = {
      runId: run.id,
      scenarioId: run.scenarioId,
      scenarioVersion: run.scenarioVersion,
      repetitionKey: run.repetitionKey,
      status: run.status,
      eventCount: timeline.length,
      realDurationMs: Date.now() - realStartedAt,
      simulatedDurationMs:
        run.simulatedNow.getTime() - run.simulatedStartAt.getTime(),
      incidentConfiguration: run.diagnostics.incidentCodes,
      incidents: run.diagnostics.observedIncidents,
      orders: run.diagnostics.ordersByStatus,
      stock: run.diagnostics.stock,
      invariants: run.invariantResults,
      timeline: normalizeTimeline(timeline, run.simulatedStartAt),
      diagnostics: run.diagnostics,
    };
    if (options.cleanup) {
      await runtime.cleanup(run.id, false);
    }
    if (run.status === 'FAILED' || failedInvariant) {
      process.exitCode = 1;
    }
    return result;
  } finally {
    await app.close();
  }
}

export function parseOptions(argv: string[]): CliOptions {
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

if (require.main === module) {
  runLabHeadless(parseOptions(process.argv.slice(2)))
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.stack : String(error);
      process.stderr.write(`[Bentoo Lab] Ejecución fallida: ${message}\n`);
      process.exitCode = 1;
    });
}
