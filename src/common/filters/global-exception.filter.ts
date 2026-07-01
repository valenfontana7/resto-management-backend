import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { sanitizeForLogs, sanitizeUrlForLogs } from '../logging/sanitize.util';

function extractExceptionPayload(
  exception: HttpException,
): Record<string, unknown> {
  const response = exception.getResponse();
  if (typeof response === 'object' && response !== null) {
    return response as Record<string, unknown>;
  }
  return { message: response };
}

function readPayloadString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === 'string')
      .join(', ');
  }
  return fallback;
}

function readPayloadCode(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function shouldSkipErrorLog(
  status: number,
  payload: Record<string, unknown>,
): boolean {
  const code = readPayloadCode(payload.code);
  const message = readPayloadString(payload.message);

  if (status === 503 && code === 'SYSTEM_MAINTENANCE') {
    return true;
  }

  if (status === 403 && code === 'REGISTRATION_DISABLED') {
    return true;
  }

  if (status === 401) {
    if (
      message.includes('No token provided') ||
      message.includes('Unauthorized')
    ) {
      return true;
    }
  }

  if (status === 404) {
    if (message.startsWith('Cannot GET') || message.startsWith('Cannot POST')) {
      return true;
    }
  }

  return false;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let error = 'Internal Server Error';
    let payload: Record<string, unknown> = {};
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      payload = extractExceptionPayload(exception);
      message = readPayloadString(payload.message, message);
      error = readPayloadString(payload.error, error);
      code = readPayloadCode(payload.code);
    } else if (exception instanceof Error) {
      message = exception.message;
      error = exception.name;
    }

    const sanitizedPath = sanitizeUrlForLogs(request.url);
    const skipErrorLog = shouldSkipErrorLog(status, payload);

    if (!skipErrorLog) {
      this.logger.error(
        `HTTP ${status} Error: ${message}`,
        sanitizeForLogs({
          url: sanitizedPath,
          method: request.method,
          ip: request.ip,
          userAgent: request.get('User-Agent'),
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const responseBody = {
      statusCode: status,
      message,
      error,
      ...(code ? { code } : {}),
      ...(typeof payload.email === 'string' ? { email: payload.email } : {}),
      timestamp: new Date().toISOString(),
      path: sanitizedPath,
      ...(isProduction
        ? {}
        : { stack: exception instanceof Error ? exception.stack : undefined }),
    };

    response.status(status).json(responseBody);
  }
}
