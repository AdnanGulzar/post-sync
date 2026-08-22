import { SocialAccount } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PublisherRegistry } from '../publishers/publisher.registry';
import { TokenExpiredError } from '../publishers/publisher.errors';
import { TokenCrypto } from './token-crypto';
import { TokenVault } from './token-vault';
import type { RefreshedTokens, StoredCredentials } from './refreshable';

const SECRET = 'test-only-encryption-key-nUqR3mZ7fLxW2pB9';
const crypto = new TokenCrypto(SECRET);

/** Captures what the vault writes back, so assertions can inspect it. */
function fakePrisma() {
  const updates: Array<Record<string, unknown>> = [];
  return {
    updates,
    socialAccount: {
      update: ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return Promise.resolve({});
      },
    },
  } as unknown as PrismaService & { updates: Array<Record<string, unknown>> };
}

function registryWith(publisher: unknown): PublisherRegistry {
  return { for: () => publisher } as unknown as PublisherRegistry;
}

function accountWith(overrides: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id: 'acc-1',
    userId: 'user-1',
    platform: 'X',
    destinationType: 'PERSONAL',
    platformUserId: 'p1',
    platformUsername: 'someone',
    accessToken: crypto.encrypt('current-access-token'),
    refreshToken: crypto.encrypt('current-refresh-token'),
    keyVersion: 1,
    tokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    scopes: null,
    status: 'ACTIVE',
    connectedAt: new Date(),
    metadata: null,
    ...overrides,
  } as SocialAccount;
}

const inAnHour = () => new Date(Date.now() + 3_600_000);
const twoMinutesAgo = () => new Date(Date.now() - 120_000);

describe('TokenVault', () => {
  it('decrypts and returns a token that is not near expiry, without refreshing', async () => {
    let refreshCalls = 0;
    const publisher = {
      refreshTokens: () => {
        refreshCalls++;
        return Promise.resolve({ accessToken: 'unused' });
      },
    };
    const vault = new TokenVault(fakePrisma(), registryWith(publisher), crypto);

    await expect(vault.getValidAccessToken(accountWith())).resolves.toBe('current-access-token');
    expect(refreshCalls).toBe(0);
  });

  it('refreshes an expired token and returns the new one', async () => {
    // The bug this fixes: X access tokens expire in about two hours and the
    // stored refresh token was never used, so publishing silently stopped.
    const prisma = fakePrisma();
    const publisher = {
      refreshTokens: (c: StoredCredentials): Promise<RefreshedTokens> => {
        expect(c.refreshToken).toBe('current-refresh-token');
        return Promise.resolve({
          accessToken: 'fresh-access-token',
          refreshToken: 'rotated-refresh-token',
          expiresAt: inAnHour(),
        });
      },
    };
    const vault = new TokenVault(prisma, registryWith(publisher), crypto);

    const token = await vault.getValidAccessToken(accountWith({ tokenExpiresAt: twoMinutesAgo() }));
    expect(token).toBe('fresh-access-token');
  });

  it('persists the rotated refresh token, encrypted', async () => {
    // X rotates the refresh token on every use. Failing to store the new one
    // breaks the *next* refresh, hours later, looking unrelated.
    const prisma = fakePrisma();
    const publisher = {
      refreshTokens: () =>
        Promise.resolve({
          accessToken: 'fresh-access-token',
          refreshToken: 'rotated-refresh-token',
          expiresAt: inAnHour(),
        }),
    };
    const vault = new TokenVault(prisma, registryWith(publisher), crypto);
    await vault.getValidAccessToken(accountWith({ tokenExpiresAt: twoMinutesAgo() }));

    const written = prisma.updates[0] as { accessToken: string; refreshToken: string };
    expect(written.accessToken).not.toContain('fresh-access-token');
    expect(crypto.decrypt(written.accessToken)).toBe('fresh-access-token');
    expect(crypto.decrypt(written.refreshToken)).toBe('rotated-refresh-token');
  });

  it('keeps the existing refresh token when the provider does not rotate', async () => {
    const prisma = fakePrisma();
    const publisher = {
      refreshTokens: () => Promise.resolve({ accessToken: 'fresh', expiresAt: inAnHour() }),
    };
    const vault = new TokenVault(prisma, registryWith(publisher), crypto);
    await vault.getValidAccessToken(accountWith({ tokenExpiresAt: twoMinutesAgo() }));

    expect(prisma.updates[0]).not.toHaveProperty('refreshToken');
  });

  it('refreshes only once when several publishes race on the same account', async () => {
    // Publishing fans out concurrently. Without the in-flight map every branch
    // would refresh at once, and with a rotating refresh token all but one of
    // those responses would be immediately invalid.
    let refreshCalls = 0;
    const publisher = {
      refreshTokens: async (): Promise<RefreshedTokens> => {
        refreshCalls++;
        await new Promise((r) => setTimeout(r, 10));
        return { accessToken: 'fresh', refreshToken: 'rotated', expiresAt: inAnHour() };
      },
    };
    const vault = new TokenVault(fakePrisma(), registryWith(publisher), crypto);
    const account = accountWith({ tokenExpiresAt: twoMinutesAgo() });

    const results = await Promise.all([
      vault.getValidAccessToken(account),
      vault.getValidAccessToken(account),
      vault.getValidAccessToken(account),
    ]);

    expect(results).toEqual(['fresh', 'fresh', 'fresh']);
    expect(refreshCalls).toBe(1);
  });

  it('marks the account NEEDS_RECONNECT when the provider rejects the refresh', async () => {
    const prisma = fakePrisma();
    const publisher = { refreshTokens: () => Promise.reject(new Error('invalid_grant')) };
    const vault = new TokenVault(prisma, registryWith(publisher), crypto);

    await expect(
      vault.getValidAccessToken(accountWith({ tokenExpiresAt: twoMinutesAgo() })),
    ).rejects.toBeInstanceOf(TokenExpiredError);
    expect(prisma.updates[0]).toEqual({ status: 'NEEDS_RECONNECT' });
  });

  it('marks NEEDS_RECONNECT when the platform cannot refresh at all', async () => {
    // LinkedIn: its refresh grant needs Marketing Developer Platform approval.
    const prisma = fakePrisma();
    const vault = new TokenVault(prisma, registryWith({}), crypto);

    await expect(
      vault.getValidAccessToken(accountWith({ platform: 'LINKEDIN', tokenExpiresAt: twoMinutesAgo() })),
    ).rejects.toBeInstanceOf(TokenExpiredError);
    expect(prisma.updates[0]).toEqual({ status: 'NEEDS_RECONNECT' });
  });

  it('refuses an account already flagged NEEDS_RECONNECT without calling the provider', async () => {
    let called = false;
    const publisher = { refreshTokens: () => { called = true; return Promise.resolve({ accessToken: 'x' }); } };
    const vault = new TokenVault(fakePrisma(), registryWith(publisher), crypto);

    await expect(
      vault.getValidAccessToken(accountWith({ status: 'NEEDS_RECONNECT' })),
    ).rejects.toBeInstanceOf(TokenExpiredError);
    expect(called).toBe(false);
  });

  it('treats a missing expiry as non-expiring rather than refreshing every call', async () => {
    let refreshCalls = 0;
    const publisher = { refreshTokens: () => { refreshCalls++; return Promise.resolve({ accessToken: 'x' }); } };
    const vault = new TokenVault(fakePrisma(), registryWith(publisher), crypto);

    await expect(
      vault.getValidAccessToken(accountWith({ tokenExpiresAt: null })),
    ).resolves.toBe('current-access-token');
    expect(refreshCalls).toBe(0);
  });

  it('refreshes inside the pre-expiry window, before the token actually dies', async () => {
    const publisher = {
      refreshTokens: () => Promise.resolve({ accessToken: 'fresh', expiresAt: inAnHour() }),
    };
    const vault = new TokenVault(fakePrisma(), registryWith(publisher), crypto);
    // Still valid, but only just — a publish starting now could outlive it.
    const nearlyExpired = new Date(Date.now() + 60_000);

    await expect(
      vault.getValidAccessToken(accountWith({ tokenExpiresAt: nearlyExpired })),
    ).resolves.toBe('fresh');
  });

  it('encrypts credentials for storage rather than passing them through', () => {
    const vault = new TokenVault(fakePrisma(), registryWith({}), crypto);
    const stored = vault.encryptForStorage('access-abc', 'refresh-xyz');

    expect(stored.accessToken).not.toContain('access-abc');
    expect(crypto.decrypt(stored.accessToken)).toBe('access-abc');
    expect(crypto.decrypt(stored.refreshToken as string)).toBe('refresh-xyz');
    expect(stored.keyVersion).toBe(1);
  });

  it('stores null when the provider issued no refresh token', () => {
    const vault = new TokenVault(fakePrisma(), registryWith({}), crypto);
    expect(vault.encryptForStorage('access-only').refreshToken).toBeNull();
  });
});
