import { applyDecorators } from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';

const E2E_RELAXED_AUTH = process.env.E2E_RELAX_AUTH_THROTTLE === 'true';

/** Throttle auth register/login en prod; sin límite cuando Playwright levanta el backend E2E. */
export function E2eAwareAuthThrottle(limit: number, ttl = 60_000) {
  if (E2E_RELAXED_AUTH) {
    return applyDecorators(SkipThrottle());
  }
  return applyDecorators(Throttle({ default: { ttl, limit } }));
}
