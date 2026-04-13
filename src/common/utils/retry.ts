import { Logger } from '@nestjs/common';

export interface RetryOptions {
  /** Max number of attempts (including the first). Default: 3 */
  attempts?: number;
  /** Base delay in ms between retries. Default: 1000 */
  baseDelay?: number;
  /** Exponential backoff multiplier. Default: 2 */
  multiplier?: number;
  /** Optional function to decide if a given error is retryable. Default: always retry. */
  isRetryable?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  attempts: 3,
  baseDelay: 1000,
  multiplier: 2,
  isRetryable: () => true,
};

/**
 * Execute an async function with exponential backoff retry.
 *
 * @param label - Human-readable label for logging
 * @param fn    - The async operation to execute
 * @param opts  - Retry configuration
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts?: RetryOptions,
): Promise<T> {
  const logger = new Logger('withRetry');
  const { attempts, baseDelay, multiplier, isRetryable } = {
    ...DEFAULT_OPTIONS,
    ...opts,
  };

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === attempts || !isRetryable(error)) {
        break;
      }

      const delay = baseDelay * Math.pow(multiplier, attempt - 1);
      logger.warn(
        `${label} failed (attempt ${attempt}/${attempts}), retrying in ${delay}ms: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
