/**
 * Tokens returned by a provider's refresh grant.
 */
export interface RefreshedTokens {
  readonly accessToken: string;
  /**
   * The replacement refresh token, when the provider rotates it. X does rotate,
   * so failing to persist this breaks the *next* refresh rather than this one —
   * a failure that surfaces hours later and looks unrelated.
   */
  readonly refreshToken?: string;
  readonly expiresAt?: Date;
}

/**
 * Implemented by publishers whose provider supports refreshing an access token
 * without user interaction.
 *
 * Not every platform can: LinkedIn's refresh grant requires Marketing Developer
 * Platform approval, so its tokens simply expire and the account is marked
 * NEEDS_RECONNECT. Callers must feature-detect with {@link isRefreshable} rather
 * than assume.
 */
export interface StoredCredentials {
  readonly accessToken: string;
  readonly refreshToken?: string;
}

export interface RefreshableTokenSource {
  /**
   * Obtains fresh credentials.
   *
   * Takes the whole credential set rather than just a refresh token, because
   * providers differ in what they consume: X posts a refresh_token grant, while
   * Meta has no refresh token at all and re-exchanges the still-valid access
   * token itself. Each publisher picks the field it needs.
   *
   * @param current - The account's stored credentials, already decrypted.
   * @returns The new credentials to persist.
   * @throws {PublisherError} If the provider rejects them, in which case the
   *         account needs reconnecting.
   */
  refreshTokens(current: StoredCredentials): Promise<RefreshedTokens>;
}

/**
 * @param candidate - Any publisher.
 * @returns `true` when the publisher can refresh its own tokens.
 */
export function isRefreshable(candidate: unknown): candidate is RefreshableTokenSource {
  return typeof (candidate as RefreshableTokenSource)?.refreshTokens === 'function';
}
