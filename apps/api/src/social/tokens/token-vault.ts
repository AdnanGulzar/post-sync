import { Injectable, Logger } from '@nestjs/common';
import { SocialAccount } from '@prisma/client';
import type { PlatformId } from '@syncpost/platform-core';
import { PrismaService } from '../../prisma/prisma.service';
import { PublisherRegistry } from '../publishers/publisher.registry';
import { TokenExpiredError } from '../publishers/publisher.errors';
import { errorMessage } from '../../common/errors';
import { CURRENT_KEY_VERSION, TokenCrypto } from './token-crypto';
import { isRefreshable, type RefreshedTokens } from './refreshable';

/**
 * Refresh a token this long before it actually expires, so a publish that starts
 * just under the wire does not fail mid-flight.
 */
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

/**
 * Owns OAuth token storage: encryption at rest, and refreshing before use.
 *
 * Fixes the gap where no refresh existed anywhere in the codebase. `refresh_token`
 * was captured and persisted for X and then never used, and `tokenExpiresAt` was
 * written on every connect and read nowhere — so X access tokens died after about
 * two hours and the only remedy was for the user to manually reconnect.
 */
@Injectable()
export class TokenVault {
  private readonly logger = new Logger(TokenVault.name);

  /**
   * In-flight refreshes, keyed by account id.
   *
   * Publishing fans out across destinations concurrently, so several calls can
   * discover the same expired token at once. Without this they would all hit the
   * provider's refresh endpoint together, and with a rotating refresh token
   * (X rotates) every response but one would be invalidated immediately.
   *
   * ponytail: in-process only, which is correct while one worker owns a post.
   * Concurrent refreshes across instances need a row lock instead.
   */
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: PublisherRegistry,
    private readonly crypto: TokenCrypto,
  ) {}

  /**
   * Returns a usable access token for an account, refreshing it first if needed.
   *
   * @param account - The connected account, as stored.
   * @returns A decrypted, non-expired access token.
   * @throws {TokenExpiredError} If the token is expired and cannot be refreshed —
   *         either the provider has no refresh grant or it rejected ours. The
   *         account is marked NEEDS_RECONNECT before this throws.
   */
  async getValidAccessToken(account: SocialAccount): Promise<string> {
    if (account.status === 'NEEDS_RECONNECT') {
      throw new TokenExpiredError(account.platform);
    }

    if (!this.isExpiring(account)) {
      return this.crypto.decrypt(account.accessToken);
    }

    const existing = this.inFlight.get(account.id);
    if (existing) return existing;

    const refresh = this.refreshAndStore(account).finally(() => {
      this.inFlight.delete(account.id);
    });
    this.inFlight.set(account.id, refresh);
    return refresh;
  }

  /**
   * Whether the token is expired or close enough to it to be worth renewing.
   *
   * A missing `tokenExpiresAt` is treated as "does not expire": some providers
   * omit `expires_in`, and refreshing on every call would be worse than trusting
   * the provider to reject a dead token, which surfaces as TokenExpiredError.
   */
  private isExpiring(account: SocialAccount): boolean {
    if (!account.tokenExpiresAt) return false;
    return account.tokenExpiresAt.getTime() - Date.now() <= REFRESH_WINDOW_MS;
  }

  private async refreshAndStore(account: SocialAccount): Promise<string> {
    const publisher = this.registry.for(account.platform as PlatformId);

    if (!isRefreshable(publisher)) {
      // LinkedIn, for instance: its refresh grant needs Marketing Developer
      // Platform approval, so the token simply expires.
      await this.markNeedsReconnect(account.id);
      throw new TokenExpiredError(account.platform);
    }

    let refreshed: RefreshedTokens;
    try {
      refreshed = await publisher.refreshTokens({
        accessToken: this.crypto.decrypt(account.accessToken),
        refreshToken: account.refreshToken
          ? this.crypto.decrypt(account.refreshToken)
          : undefined,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `Token refresh failed for ${account.platform} account ${account.id}: ${errorMessage(err)}`,
      );
      await this.markNeedsReconnect(account.id);
      throw new TokenExpiredError(account.platform, err);
    }

    await this.prisma.socialAccount.update({
      where: { id: account.id },
      data: {
        accessToken: this.crypto.encrypt(refreshed.accessToken),
        // Providers that rotate the refresh token send a new one; keep the old
        // when they do not, rather than nulling it.
        ...(refreshed.refreshToken
          ? { refreshToken: this.crypto.encrypt(refreshed.refreshToken) }
          : {}),
        tokenExpiresAt: refreshed.expiresAt ?? null,
        keyVersion: CURRENT_KEY_VERSION,
        status: 'ACTIVE',
      },
    });

    this.logger.log(`Refreshed ${account.platform} token for account ${account.id}`);
    return refreshed.accessToken;
  }

  /**
   * Encrypts credentials for storage.
   *
   * @param accessToken - Raw provider access token.
   * @param refreshToken - Raw provider refresh token, when issued.
   * @returns Columns to spread into a Prisma create or update.
   */
  encryptForStorage(
    accessToken: string,
    refreshToken?: string,
  ): { accessToken: string; refreshToken: string | null; keyVersion: number } {
    return {
      accessToken: this.crypto.encrypt(accessToken),
      refreshToken: refreshToken ? this.crypto.encrypt(refreshToken) : null,
      keyVersion: CURRENT_KEY_VERSION,
    };
  }

  /** Flags an account as needing user re-authorisation. */
  private async markNeedsReconnect(accountId: string): Promise<void> {
    await this.prisma.socialAccount.update({
      where: { id: accountId },
      data: { status: 'NEEDS_RECONNECT' },
    });
  }
}
