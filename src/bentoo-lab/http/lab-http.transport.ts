import { Inject, Injectable, Optional } from '@nestjs/common';
import { LabExecutionOrigin } from '../../common/execution/execution-context.service';

export const LAB_HTTP_ENV = 'BENTOO_LAB_HTTP_ENV';

export interface LabHttpRequest {
  path: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  jwt?: string;
  runId: string;
  participantKey: string;
  origin: LabExecutionOrigin;
  simulatedNow: Date;
  correlationId: string;
  body?: unknown;
}

@Injectable()
export class LabHttpTransport {
  private readonly env: Record<string, string | undefined>;
  private baseUrl: string | null = null;

  constructor(
    @Optional()
    @Inject(LAB_HTTP_ENV)
    env?: Record<string, string | undefined>,
  ) {
    this.env = env ?? process.env;
  }

  configure(port: number): void {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`Puerto loopback inválido: ${port}`);
    }
    this.baseUrl = `http://127.0.0.1:${port}`;
  }

  async request<TResult = unknown>(request: LabHttpRequest): Promise<TResult> {
    if (!this.baseUrl) {
      throw new Error('LabHttpTransport todavía no fue configurado');
    }
    if (
      !request.path.startsWith('/') ||
      request.path.startsWith('//') ||
      request.path.includes('://')
    ) {
      throw new Error('LabHttpTransport requiere una ruta relativa');
    }

    const target = new URL(request.path, this.baseUrl);
    if (
      target.protocol !== 'http:' ||
      target.hostname !== '127.0.0.1' ||
      target.origin !== this.baseUrl
    ) {
      throw new Error('LabHttpTransport rechazó un destino no-loopback');
    }

    const internalToken = this.env.BENTOO_LAB_INTERNAL_TOKEN?.trim();
    if (!internalToken) {
      throw new Error('BENTOO_LAB_INTERNAL_TOKEN no está configurado');
    }

    const headers: Record<string, string> = {
      accept: 'application/json',
      'content-type': 'application/json',
      'x-bentoo-lab-run': request.runId,
      'x-bentoo-lab-participant': request.participantKey,
      'x-bentoo-lab-origin': request.origin,
      'x-bentoo-lab-simulated-at': request.simulatedNow.toISOString(),
      'x-bentoo-lab-internal-token': internalToken,
      'x-correlation-id': request.correlationId,
    };
    if (request.jwt) {
      headers.authorization = `Bearer ${request.jwt}`;
    }

    const response = await fetch(target.toString(), {
      method: request.method,
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    const contentType = response.headers.get('content-type') ?? '';
    const responseBody = contentType.includes('application/json')
      ? await response.json()
      : await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP Lab ${request.method} ${request.path} falló (${response.status}): ${JSON.stringify(
          responseBody,
        )}`,
      );
    }

    return responseBody as TResult;
  }
}
