import { USER_SAFE_SELECT, USER_WITH_SUBSCRIPTION_SELECT } from './user-select';

/**
 * Guards the fix for admin endpoints that serialised every user's bcrypt
 * `passwordHash` to the admin SPA. These selects are the single chokepoint, so
 * asserting on them covers all four endpoints at once.
 */
describe('user select allowlists', () => {
  const SECRETS = ['passwordHash', 'password'];

  it('never selects a credential column', () => {
    for (const secret of SECRETS) {
      expect(Object.keys(USER_SAFE_SELECT)).not.toContain(secret);
      expect(Object.keys(USER_WITH_SUBSCRIPTION_SELECT)).not.toContain(secret);
    }
  });

  it('is an allowlist, not a denylist', () => {
    // Every entry must be an explicit opt-in. A `false` value would mean
    // someone had switched to exclusion, where a new column defaults to
    // exposed — the exact failure mode this replaced.
    for (const value of Object.values(USER_SAFE_SELECT)) {
      expect(value).toBe(true);
    }
  });

  it('still selects the fields the admin list renders', () => {
    expect(Object.keys(USER_WITH_SUBSCRIPTION_SELECT)).toEqual(
      expect.arrayContaining(['id', 'email', 'name', 'isActive', 'createdAt', 'subscription']),
    );
  });

  it('does not expose OAuth tokens through the socialAccounts relation', () => {
    const accounts = USER_WITH_SUBSCRIPTION_SELECT.socialAccounts.select;
    expect(Object.keys(accounts)).not.toContain('accessToken');
    expect(Object.keys(accounts)).not.toContain('refreshToken');
  });
});
