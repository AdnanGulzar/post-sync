import { Injectable } from '@nestjs/common';
import axios, { AxiosError, AxiosRequestConfig, AxiosInstance } from 'axios';

/** How long any single provider call may take before it is abandoned. */
const DEFAULT_TIMEOUT_MS = 10_000;

/** Fallback delay when a 429 arrives without a usable `Retry-After`. */
const DEFAULT_RETRY_AFTER_MS = 60_000;

/**
 * Thin, injectable wrapper over axios.
 *
 * Two reasons this exists rather than calling `axios.*` directly, which is what
 * every publisher did before:
 *
 * 1. **Timeouts.** There were none anywhere, so a hung provider call held the
 *    publish path open indefinitely.
 * 2. **Testability.** `axios` was imported as a module singleton, so testing a
 *    publisher meant `jest.mock('axios')` at module scope. Injecting the client
 *    lets a test pass a stub in.
 */
@Injectable()
export class HttpClient {
  private readonly instance: AxiosInstance;

  constructor(timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.instance = axios.create({ timeout: timeoutMs });
  }

  /**
   * Performs a request.
   *
   * @param config - Standard axios config; `timeout` is applied if unset.
   * @returns The parsed response body.
   * @throws {AxiosError} Untranslated. Callers go through
   *         {@link BasePublisher.request}, which maps these to typed errors.
   */
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    const res = await this.instance.request<T>(config);
    return res.data;
  }
}

/**
 * Reads a `Retry-After` header, which providers send either as seconds or as an
 * HTTP date.
 *
 * @param err - The rejected request.
 * @returns Delay in milliseconds, falling back to {@link DEFAULT_RETRY_AFTER_MS}
 *          when the header is absent or unparseable.
 */
export function retryAfterMsFrom(err: AxiosError): number {
  const header = err.response?.headers?.['retry-after'];
  if (typeof header !== 'string' && typeof header !== 'number') return DEFAULT_RETRY_AFTER_MS;

  const asSeconds = Number(header);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return asSeconds * 1000;

  const asDate = new Date(String(header)).getTime();
  if (Number.isFinite(asDate)) return Math.max(0, asDate - Date.now());

  return DEFAULT_RETRY_AFTER_MS;
}
