import { AxiosError, AxiosHeaders } from 'axios';
import { PLATFORMS } from '@syncpost/platform-core';
import { BasePublisher } from './base-publisher';
import { HttpClient } from './http-client';
import {
  PermanentError,
  RateLimitedError,
  TokenExpiredError,
  TransientError,
} from './publisher.errors';

/** Builds an AxiosError the way axios itself would for a given HTTP status. */
function httpError(status: number, data: unknown = {}, headers: Record<string, string> = {}) {
  const err = new AxiosError('request failed', 'ERR_BAD_RESPONSE');
  err.response = {
    status,
    statusText: '',
    data,
    headers: new AxiosHeaders(headers),
    config: { headers: new AxiosHeaders() },
  };
  return err;
}

/** Minimal concrete publisher; only the error path is under test. */
class TestPublisher extends BasePublisher {
  readonly descriptor = PLATFORMS.X;

  constructor(http: HttpClient) {
    super(http);
  }

  protected errorDetail(body: unknown): string | undefined {
    return (body as { detail?: string } | undefined)?.detail;
  }

  /** Exposes the protected helpers for testing. */
  call(): Promise<unknown> {
    return this.request({ url: 'https://example.test' });
  }

  expiry(seconds: number | undefined): Date | undefined {
    return this.expiresAt(seconds);
  }

  url(base: string, params: Record<string, string | undefined>): string {
    return this.authUrl(base, params);
  }
}

/** An HttpClient that always rejects with the supplied error. */
function failingWith(err: unknown): HttpClient {
  return { request: () => Promise.reject(err) } as unknown as HttpClient;
}

describe('BasePublisher error translation', () => {
  it('maps 401 to TokenExpiredError', async () => {
    const p = new TestPublisher(failingWith(httpError(401)));
    await expect(p.call()).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('maps 403 to TokenExpiredError', async () => {
    const p = new TestPublisher(failingWith(httpError(403)));
    await expect(p.call()).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it('maps 429 to RateLimitedError and honours Retry-After seconds', async () => {
    const p = new TestPublisher(failingWith(httpError(429, {}, { 'retry-after': '120' })));
    await expect(p.call()).rejects.toMatchObject({ retryAfterMs: 120_000, retryable: true });
  });

  it('falls back to a default delay when Retry-After is missing', async () => {
    const p = new TestPublisher(failingWith(httpError(429)));
    const err = await p.call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RateLimitedError);
    expect((err as RateLimitedError).retryAfterMs).toBeGreaterThan(0);
  });

  it('maps 5xx to a retryable TransientError', async () => {
    const p = new TestPublisher(failingWith(httpError(503)));
    await expect(p.call()).rejects.toMatchObject({ retryable: true });
    await expect(p.call()).rejects.toBeInstanceOf(TransientError);
  });

  it('maps a timeout with no response to TransientError', async () => {
    const timeout = new AxiosError('timeout of 10000ms exceeded', 'ECONNABORTED');
    const p = new TestPublisher(failingWith(timeout));
    await expect(p.call()).rejects.toBeInstanceOf(TransientError);
  });

  it('maps other 4xx to a non-retryable PermanentError carrying the provider reason', async () => {
    const p = new TestPublisher(failingWith(httpError(400, { detail: 'duplicate content' })));
    const err = await p.call().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PermanentError);
    expect((err as PermanentError).retryable).toBe(false);
    expect((err as PermanentError).message).toContain('duplicate content');
  });

  it('falls back to the status when the body has no recognisable reason', async () => {
    const p = new TestPublisher(failingWith(httpError(422, { unexpected: 'shape' })));
    await expect(p.call()).rejects.toThrow(/HTTP 422/);
  });

  it('treats a non-axios throw as transient rather than swallowing it', async () => {
    const p = new TestPublisher(failingWith(new Error('socket hang up')));
    await expect(p.call()).rejects.toBeInstanceOf(TransientError);
  });
});

describe('BasePublisher helpers', () => {
  const p = new TestPublisher(failingWith(new Error('unused')));

  it('converts expires_in seconds to an absolute expiry', () => {
    const before = Date.now();
    const at = p.expiry(3600);
    expect(at).toBeDefined();
    expect((at as Date).getTime()).toBeGreaterThanOrEqual(before + 3_600_000);
  });

  it('returns undefined when the provider omits expires_in', () => {
    // Distinct from "expires now" — the token simply does not self-describe.
    expect(p.expiry(undefined)).toBeUndefined();
  });

  it('drops undefined query parameters rather than serialising them', () => {
    const url = p.url('https://x.test/auth', { a: '1', b: undefined, c: '3' });
    expect(url).toBe('https://x.test/auth?a=1&c=3');
  });
});
