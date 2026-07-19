import {
  BadRequestException,
  Inject,
  Injectable,
  NestMiddleware,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  ExecutionContextService,
  LabExecutionOrigin,
} from '../../common/execution/execution-context.service';
import { isLabRuntime } from '../../common/config/bentoo-mode.config';

export const LAB_MIDDLEWARE_ENV = 'BENTOO_LAB_MIDDLEWARE_ENV';

@Injectable()
export class LabExecutionContextMiddleware implements NestMiddleware {
  private readonly env: Record<string, string | undefined>;

  constructor(
    private readonly executionContext: ExecutionContextService,
    @Optional()
    @Inject(LAB_MIDDLEWARE_ENV)
    env?: Record<string, string | undefined>,
  ) {
    this.env = env ?? process.env;
  }

  use(request: Request, _response: Response, next: NextFunction): void {
    const runId = this.header(request, 'x-bentoo-lab-run');
    if (!isLabRuntime(this.env) || !runId) {
      next();
      return;
    }

    const expectedToken = this.env.BENTOO_LAB_INTERNAL_TOKEN?.trim() ?? '';
    const receivedToken = this.header(request, 'x-bentoo-lab-internal-token');
    if (!this.tokensMatch(expectedToken, receivedToken)) {
      throw new UnauthorizedException('Token interno de Bentoo Lab inválido');
    }

    const participantKey = this.header(request, 'x-bentoo-lab-participant');
    const origin = this.header(request, 'x-bentoo-lab-origin');
    const correlationId = this.header(request, 'x-correlation-id');
    const simulatedAt = this.header(request, 'x-bentoo-lab-simulated-at');
    if (!participantKey || !correlationId || !simulatedAt) {
      throw new BadRequestException('Contexto de Bentoo Lab incompleto');
    }
    if (!this.isExecutionOrigin(origin)) {
      throw new BadRequestException('Origen de Bentoo Lab inválido');
    }

    const simulatedNow = new Date(simulatedAt);
    if (Number.isNaN(simulatedNow.getTime())) {
      throw new BadRequestException('Hora simulada inválida');
    }

    this.executionContext.run(
      {
        runId,
        participantKey,
        origin,
        correlationId,
        simulatedNow,
      },
      next,
    );
  }

  private header(request: Request, name: string): string {
    const value = request.headers[name];
    return Array.isArray(value) ? (value[0] ?? '') : (value ?? '');
  }

  private tokensMatch(expected: string, received: string): boolean {
    if (!expected || !received) {
      return false;
    }
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return (
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer)
    );
  }

  private isExecutionOrigin(value: string): value is LabExecutionOrigin {
    return value === 'SIMULATED' || value === 'HEADLESS' || value === 'MANUAL';
  }
}
