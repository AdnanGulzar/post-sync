import { createHash, randomBytes } from 'crypto';

/**
 * PKCE (RFC 7636) helpers.
 *
 * Nothing here is platform-specific — X simply happens to be the only connected
 * platform requiring it today. Callers branch on a descriptor's
 * `connection === 'oauth2-pkce'` rather than on a platform id, so a second
 * PKCE platform needs no new dispatch.
 */

/**
 * Generates a code verifier.
 *
 * @returns A cryptographically random base64url string, to be stored against
 *          the OAuth state and replayed at token exchange.
 */
export function createCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Derives the S256 challenge sent on the authorize request.
 *
 * @param verifier - The verifier from {@link createCodeVerifier}.
 * @returns The base64url-encoded SHA-256 of the verifier.
 */
export function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
