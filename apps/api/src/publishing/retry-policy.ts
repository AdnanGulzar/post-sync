import { isPublisherError } from '../social/publishers/publisher.errors';

/**
 * How many times one destination may be attempted before it is given up on.
 * Counts the first attempt, so 4 means the original plus three retries.
 */
export const MAX_ATTEMPTS = 4;

/** Base delay for exponential backoff. */
const BASE_DELAY_MS = 60_000;

/** Ceiling so a long outage does not push a retry days into the future. */
const MAX_DELAY_MS = 60 * 60 * 1000;

/** Outcome of deciding what to do with a failed destination. */
export interface RetryDecision {
  /** Whether the worker should attempt this destination again. */
  readonly shouldRetry: boolean;
  /** When to attempt it, when `shouldRetry` is true. */
  readonly nextRetryAt: Date | null;
}

/**
 * Decides whether a failed publish is worth re-attempting.
 *
 * Rests on the typed publisher errors: a 401 means the credentials are dead and
 * retrying changes nothing, while a 429 or a 5xx is worth another go. Before
 * those types existed every failure collapsed into one 500 and nothing could be
 * distinguished, so nothing was ever retried.
 *
 * @param error - The failure thrown by the publisher.
 * @param attemptCount - Attempts already made, including the one that just failed.
 * @param now - Current time, injectable so tests need not sleep.
 * @returns Whether to retry and when.
 */
export function decideRetry(
  error: unknown,
  attemptCount: number,
  now: Date = new Date(),
): RetryDecision {
  if (attemptCount >= MAX_ATTEMPTS) return { shouldRetry: false, nextRetryAt: null };

  // An unrecognised error is treated as transient: a bug in our own mapping
  // should not permanently drop someone's post.
  const retryable = isPublisherError(error) ? error.retryable : true;
  if (!retryable) return { shouldRetry: false, nextRetryAt: null };

  return { shouldRetry: true, nextRetryAt: new Date(now.getTime() + backoffMs(error, attemptCount)) };
}

/**
 * Exponential backoff, honouring a provider's own Retry-After when it sent one.
 *
 * @param error - The failure, which may carry `retryAfterMs`.
 * @param attemptCount - Attempts already made.
 * @returns Delay in milliseconds, capped at {@link MAX_DELAY_MS}.
 */
function backoffMs(error: unknown, attemptCount: number): number {
  const providerDelay =
    isPublisherError(error) && 'retryAfterMs' in error
      ? (error as { retryAfterMs: number }).retryAfterMs
      : 0;

  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attemptCount - 1);
  return Math.min(Math.max(providerDelay, exponential), MAX_DELAY_MS);
}
