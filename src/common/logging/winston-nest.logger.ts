import { LoggerService } from '@nestjs/common';
import { createLogger, format, transports, Logger } from 'winston';

function serializeMeta(optionalParams: unknown[]): Record<string, unknown> {
  if (optionalParams.length === 0) {
    return {};
  }

  if (optionalParams.length === 1 && typeof optionalParams[0] === 'string') {
    return { context: optionalParams[0] };
  }

  return { meta: optionalParams };
}

export function createWinstonLogger(): Logger {
  return createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
      format.timestamp(),
      format.errors({ stack: true }),
      format.json(),
    ),
    defaultMeta: { service: 'resto-management-backend' },
    transports: [
      new transports.Console({
        format: format.combine(format.colorize(), format.simple()),
      }),
      ...(process.env.NODE_ENV === 'production'
        ? [
            new transports.File({
              filename: 'logs/error.log',
              level: 'error',
            }),
            new transports.File({
              filename: 'logs/combined.log',
            }),
          ]
        : []),
    ],
  });
}

export class WinstonNestLogger implements LoggerService {
  constructor(private readonly logger: Logger) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info(String(message), serializeMeta(optionalParams));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    const [trace, context, ...rest] = optionalParams;
    this.logger.error(String(message), {
      trace: typeof trace === 'string' ? trace : undefined,
      context: typeof context === 'string' ? context : undefined,
      ...(rest.length > 0 ? { meta: rest } : {}),
    });
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn(String(message), serializeMeta(optionalParams));
  }

  debug?(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug(String(message), serializeMeta(optionalParams));
  }

  verbose?(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.verbose(String(message), serializeMeta(optionalParams));
  }

  fatal?(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error(String(message), {
      fatal: true,
      ...serializeMeta(optionalParams),
    });
  }

  setLogLevels?(): void {}
}
