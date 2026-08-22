import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/** AES-256-GCM: authenticated, so tampering is detected rather than silently decrypted. */
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

/**
 * Fixed salt for key derivation.
 *
 * Deliberately constant: the derived key must be identical across restarts and
 * instances or previously-encrypted rows become unreadable. A per-row salt would
 * be better practice for password hashing, but this is key derivation from an
 * already-high-entropy secret, not password storage.
 */
const KEY_SALT = 'syncpost-token-vault-v1';

/** The key version written on newly-encrypted rows. Bump when rotating. */
export const CURRENT_KEY_VERSION = 1;

/**
 * Encrypts OAuth tokens at rest.
 *
 * These were plaintext columns, so anyone with a database dump, a read replica,
 * or a backup had live posting control over every connected LinkedIn, Facebook
 * and X account.
 *
 * Ciphertext is stored as `iv:authTag:ciphertext`, all base64. The IV is random
 * per encryption, so encrypting the same token twice yields different output and
 * the column leaks nothing through equality.
 */
@Injectable()
export class TokenCrypto {
  private readonly key: Buffer;

  constructor(secret?: string) {
    const material = secret ?? process.env.TOKEN_ENCRYPTION_KEY ?? '';
    if (!material) {
      throw new Error(
        'TOKEN_ENCRYPTION_KEY is not set. OAuth tokens cannot be stored without it.',
      );
    }
    this.key = scryptSync(material, KEY_SALT, KEY_BYTES);
  }

  /**
   * Encrypts a token.
   *
   * @param plaintext - The raw provider token.
   * @returns `iv:authTag:ciphertext`, base64-encoded, safe to store.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(':');
  }

  /**
   * Decrypts a stored token.
   *
   * @param stored - A value produced by {@link encrypt}.
   * @returns The original token.
   * @throws {Error} If the value is malformed, or if the authentication tag does
   *         not verify — meaning the ciphertext was altered or the wrong key was
   *         used. Never returns garbage on failure.
   */
  decrypt(stored: string): string {
    const parts = stored.split(':');
    if (parts.length !== 3) {
      throw new Error('Stored token is not in the expected iv:authTag:ciphertext form.');
    }
    const [ivB64, tagB64, dataB64] = parts as [string, string, string];

    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error('Stored token has a malformed IV or authentication tag.');
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
