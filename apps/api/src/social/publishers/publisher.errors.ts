/**
 * Typed failures every publisher raises instead of provider-specific strings.
 *
 * Previously each publisher wrapped everything in `InternalServerErrorException`
 * with the raw provider message interpolated in. That message was persisted to
 * `PostPublishResult.error` and shown to the user, and — more importantly — the
 * worker could not tell a dead token from a rate limit from a transient 5xx, so
 * nothing could be retried intelligently.
 */

/** Base for anything a publisher can fail with. */
export abstract class PublisherError extends Error {
  /**
   * @param platform - Platform id, for logging and for the user-facing message.
   * @param message - Human-readable summary. Never interpolate a raw provider body.
   * @param cause - The underlying error, kept for structured logging only.
   */
  protected constructor(
    readonly platform: string,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }

  /** Whether re-attempting the same call could plausibly succeed. */
  abstract readonly retryable: boolean;
}

/**
 * The stored access token is rejected by the provider (401/403).
 *
 * The account should be marked as needing reconnection; retrying with the same
 * credentials cannot help.
 */
export class TokenExpiredError extends PublisherError {
  readonly retryable = false;

  constructor(platform: string, cause?: unknown) {
    super(platform, `Your ${platform} connection has expired. Reconnect it to keep publishing.`, cause);
  }
}

/** The provider returned 429. Retry once `retryAfterMs` has elapsed. */
export class RateLimitedError extends PublisherError {
  readonly retryable = true;

  /**
   * @param retryAfterMs - Delay taken from the `Retry-After` header, or a
   *                       backoff default when the provider omitted it.
   */
  constructor(
    platform: string,
    readonly retryAfterMs: number,
    cause?: unknown,
  ) {
    super(platform, `${platform} is rate limiting us. This will be retried automatically.`, cause);
  }
}

/** A 5xx, timeout, or network failure. Safe to retry with backoff. */
export class TransientError extends PublisherError {
  readonly retryable = true;

  constructor(platform: string, cause?: unknown) {
    super(platform, `${platform} is temporarily unavailable. This will be retried automatically.`, cause);
  }
}

/**
 * A 4xx that retrying cannot fix — a missing scope, a deleted destination, or
 * content the platform rejects.
 */
export class PermanentError extends PublisherError {
  readonly retryable = false;

  constructor(platform: string, detail: string, cause?: unknown) {
    super(platform, `${platform} rejected this post: ${detail}`, cause);
  }
}

/**
 * Narrows an unknown caught value to a publisher error.
 *
 * @param err - Any caught value.
 * @returns `true` when `err` is one of the typed publisher failures.
 */
export function isPublisherError(err: unknown): err is PublisherError {
  return err instanceof PublisherError;
}
