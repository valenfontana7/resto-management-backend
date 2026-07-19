import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { isLabRuntime } from '../config/bentoo-mode.config';

@Injectable()
export class LabAwareThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(
    context: ExecutionContext,
  ): Promise<boolean> {
    if (isLabRuntime()) {
      const request = context.switchToHttp().getRequest<{
        headers?: Record<string, string | string[] | undefined>;
      }>();
      const suppliedToken = request.headers?.['x-bentoo-lab-internal-token'];
      const internalToken = process.env.BENTOO_LAB_INTERNAL_TOKEN;
      if (
        internalToken &&
        typeof suppliedToken === 'string' &&
        suppliedToken === internalToken
      ) {
        return true;
      }
    }
    return super.shouldSkip(context);
  }
}
