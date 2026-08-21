import {
  PermanentError,
  RateLimitedError,
  TokenExpiredError,
  TransientError,
} from '../social/publishers/publisher.errors';
import { MAX_ATTEMPTS, decideRetry } from './retry-policy';

const NOW = new Date('2026-01-01T12:00:00.000Z');
const delayMs = (d: { nextRetryAt: Date | null }) => (d.nextRetryAt as Date).getTime() - NOW.getTime();

describe('decideRetry', () => {
  it('retries a transient failure', () => {
    const d = decideRetry(new TransientError('X'), 1, NOW);
    expect(d.shouldRetry).toBe(true);
    expect(d.nextRetryAt).toBeInstanceOf(Date);
  });

  it('retries a rate limit', () => {
    expect(decideRetry(new RateLimitedError('X', 30_000), 1, NOW).shouldRetry).toBe(true);
  });

  it('does not retry a dead token', () => {
    // Retrying with the same rejected credentials cannot succeed; the account
    // is marked NEEDS_RECONNECT instead.
    const d = decideRetry(new TokenExpiredError('X'), 1, NOW);
    expect(d.shouldRetry).toBe(false);
    expect(d.nextRetryAt).toBeNull();
  });

  it('does not retry a permanent rejection', () => {
    expect(decideRetry(new PermanentError('X', 'duplicate content'), 1, NOW).shouldRetry).toBe(false);
  });

  it('stops once the attempt cap is reached', () => {
    expect(decideRetry(new TransientError('X'), MAX_ATTEMPTS, NOW).shouldRetry).toBe(false);
    expect(decideRetry(new TransientError('X'), MAX_ATTEMPTS + 1, NOW).shouldRetry).toBe(false);
  });

  it('retries on the attempt just below the cap', () => {
    expect(decideRetry(new TransientError('X'), MAX_ATTEMPTS - 1, NOW).shouldRetry).toBe(true);
  });

  it('backs off exponentially', () => {
    const first = delayMs(decideRetry(new TransientError('X'), 1, NOW));
    const second = delayMs(decideRetry(new TransientError('X'), 2, NOW));
    const third = delayMs(decideRetry(new TransientError('X'), 3, NOW));
    expect(second).toBe(first * 2);
    expect(third).toBe(first * 4);
  });

  it('caps the delay so an outage cannot push a retry days out', () => {
    const d = decideRetry(new TransientError('X'), MAX_ATTEMPTS - 1, NOW);
    expect(delayMs(d)).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it("honours a provider's Retry-After when it exceeds the backoff", () => {
    const longWait = 45 * 60 * 1000;
    const d = decideRetry(new RateLimitedError('X', longWait), 1, NOW);
    expect(delayMs(d)).toBe(longWait);
  });

  it('ignores a Retry-After shorter than our own backoff', () => {
    // Retrying sooner than our backoff would just burn another attempt.
    const d = decideRetry(new RateLimitedError('X', 1_000), 1, NOW);
    expect(delayMs(d)).toBeGreaterThan(1_000);
  });

  it('treats an unrecognised error as transient', () => {
    // A gap in our own error mapping must not permanently drop a post.
    expect(decideRetry(new Error('something odd'), 1, NOW).shouldRetry).toBe(true);
  });
});
