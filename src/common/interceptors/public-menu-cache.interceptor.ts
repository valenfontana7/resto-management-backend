import { ExecutionContext, Injectable } from '@nestjs/common';
import { CacheInterceptor } from '@nestjs/cache-manager';
import { publicMenuCacheKey } from '../services/public-http-cache.keys';

/**
 * Cache key estable por slug (no usa la URL cruda del request),
 * para poder invalidar desde mutaciones de menú.
 */
@Injectable()
export class PublicMenuCacheInterceptor extends CacheInterceptor {
  trackBy(context: ExecutionContext): string | undefined {
    const request = context.switchToHttp().getRequest<{
      method?: string;
      params?: { slug?: string };
    }>();

    if (request?.method !== 'GET') return undefined;

    const slug = String(request.params?.slug || '')
      .trim()
      .toLowerCase();
    if (!slug) return undefined;

    return publicMenuCacheKey(slug);
  }
}
