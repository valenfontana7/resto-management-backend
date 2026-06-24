import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { sanitizeForLogs, sanitizeUrlForLogs } from '../logging/sanitize.util';

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction): void {
    const { method, originalUrl, ip } = req;
    const sanitizedUrl = sanitizeUrlForLogs(originalUrl);
    const userAgent = req.get('User-Agent') || '';
    const start = Date.now();

    res.on('finish', () => {
      const { statusCode } = res;
      const duration = Date.now() - start;

      if (this.shouldSkipRequestWarn(method, sanitizedUrl, statusCode)) {
        return;
      }

      // Log requests with status >= 400 or slow requests (>5s)
      if (statusCode >= 400 || duration > 5000) {
        this.logger.warn(
          `${method} ${sanitizedUrl} ${statusCode} - ${duration}ms`,
          sanitizeForLogs({
            ip,
            userAgent,
            statusCode,
            duration,
          }),
        );
      } else if (process.env.NODE_ENV !== 'production') {
        // In development, log all requests
        this.logger.log(
          `${method} ${sanitizedUrl} ${statusCode} - ${duration}ms`,
        );
      }
    });

    next();
  }

  private shouldSkipRequestWarn(
    method: string,
    url: string,
    statusCode: number,
  ): boolean {
    if (statusCode === 503) {
      return true;
    }

    if (statusCode === 403 && url.includes('/api/auth/register')) {
      return true;
    }

    if (statusCode === 401) {
      const path = url.split('?')[0] || '';
      if (
        path === '/api/auth/me' ||
        path === '/api/auth/logout' ||
        path === '/'
      ) {
        return true;
      }
    }

    if (statusCode === 404) {
      const path = url.split('?')[0] || '';
      if (
        path.includes('wp-sitemap') ||
        path.includes('xmlrpc.php') ||
        path.includes('graphql') ||
        path.includes('robots.txt') ||
        path.endsWith('/feed') ||
        path.endsWith('/rss')
      ) {
        return true;
      }
    }

    return false;
  }
}
