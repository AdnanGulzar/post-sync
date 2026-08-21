import { AxiosError, AxiosRequestConfig, AxiosResponse, isAxiosError } from 'axios';
import type { PlatformDescriptor } from '@syncpost/platform-core';
import { HttpClient, retryAfterMsFrom } from './http-client';
import {
  PermanentError,
  RateLimitedError,
  TokenExpiredError,
  TransientError,
} from './publisher.errors';

/**
 * Shared behaviour for every platform publisher.
 *
 * Absorbs what the three original publishers each reimplemented: the
 * `tokenExpiresAt` computation (7 verbatim copies), the try/catch that
 * interpolated a provider message into an `InternalServerErrorException` (11
 * copies), and the `URLSearchParams` + template-literal auth URL builder.
 *
 * What genuinely differs per platform stays abstract: the descriptor, and the
 * path through the provider's error body.
 */
export abstract class BasePublisher {
  protected constructor(protected readonly http: HttpClient) {}

  /** This platform's entry from the shared registry. */
  abstract readonly descriptor: PlatformDescriptor;

  /**
   * Extracts a human-readable reason from a provider's error body.
   *
   * Every provider nests this differently — X uses `detail`, Meta uses
   * `error.message`, LinkedIn uses `message` — which is the only reason the old
   * catch blocks could not be shared.
   *
   * @param body - The parsed error response body, shape unknown.
   * @returns A short reason, or `undefined` to fall back to the HTTP status.
   */
  protected abstract errorDetail(body: unknown): string | undefined;

  /**
   * Performs a provider call and translates any failure into a typed
   * {@link PublisherError}, so callers can distinguish a dead token from a rate
   * limit from a transient outage.
   *
   * @param config - Axios request config.
   * @returns The parsed response body.
   * @throws {TokenExpiredError} On 401/403.
   * @throws {RateLimitedError} On 429, carrying the provider's Retry-After.
   * @throws {TransientError} On 5xx, timeout, or network failure.
   * @throws {PermanentError} On any other 4xx.
   */
  protected async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      return await this.http.request<T>(config);
    } catch (err: unknown) {
      throw this.translate(err);
    }
  }

  /**
   * As {@link BasePublisher.request}, but returns the whole response so a
   * caller can read headers. Same error translation applies.
   *
   * @param config - Axios request config.
   * @returns The full axios response.
   */
  protected async requestRaw<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    try {
      return await this.http.requestRaw<T>(config);
    } catch (err: unknown) {
      throw this.translate(err);
    }
  }

  /** Maps a caught request failure onto the typed error hierarchy. */
  private translate(err: unknown): Error {
    const platform = this.descriptor.label;
    if (!isAxiosError(err)) {
      return new TransientError(platform, err);
    }

    const axiosErr: AxiosError = err;
    const status = axiosErr.response?.status;

    // No response at all: timeout, DNS failure, connection reset.
    if (status === undefined) return new TransientError(platform, err);

    if (status === 401 || status === 403) return new TokenExpiredError(platform, err);
    if (status === 429) return new RateLimitedError(platform, retryAfterMsFrom(axiosErr), err);
    if (status >= 500) return new TransientError(platform, err);

    const detail = this.errorDetail(axiosErr.response?.data) ?? `HTTP ${status}`;
    return new PermanentError(platform, detail, err);
  }

  /**
   * Converts an OAuth `expires_in` into an absolute expiry.
   *
   * @param expiresIn - Lifetime in seconds, as returned by the token endpoint.
   * @returns The absolute expiry, or `undefined` when the provider omitted it
   *          (meaning the token does not self-describe an expiry).
   */
  protected expiresAt(expiresIn: number | undefined): Date | undefined {
    return expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
  }

  /**
   * Builds a provider authorize URL.
   *
   * @param baseUrl - The provider's authorize endpoint.
   * @param params - Query parameters; entries with an `undefined` value are dropped.
   * @returns The absolute URL to redirect the user's browser to.
   */
  protected authUrl(baseUrl: string, params: Record<string, string | undefined>): string {
    const defined = Object.entries(params).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    );
    return `${baseUrl}?${new URLSearchParams(defined).toString()}`;
  }
}
