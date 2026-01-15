import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const userAgent = req.get('User-Agent') || '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;

      // Log requests with status >= 400 or slow requests (>5s)
      if (statusCode >= 400 || duration > 5000) {
        this.logger.warn(
          `${method} ${originalUrl} ${statusCode} - ${duration}ms`,
          {
            ip,
            userAgent,
            statusCode,
            duration,
          },
        );
      } else if (process.env.NODE_ENV !== 'production') {
        // In development, log all requests
        this.logger.log(
          `${method} ${originalUrl} ${statusCode} - ${duration}ms`,
        );
      }
    });

    next();
  }
}
