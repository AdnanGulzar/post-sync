import { validateEnv } from './env.validation';

const VALID = {
  DATABASE_URL: 'postgresql://localhost:5432/syncpost',
  JWT_SECRET: 'a'.repeat(48),
};

describe('validateEnv', () => {
  it('accepts a complete environment', () => {
    expect(() => validateEnv({ ...VALID })).not.toThrow();
  });

  it('rejects a missing JWT_SECRET rather than defaulting it', () => {
    // The bug this replaces: an unset JWT_SECRET silently became
    // 'dev-secret-change-me', so anyone could forge an ADMIN token.
    const { JWT_SECRET: _omitted, ...withoutSecret } = VALID;
    expect(() => validateEnv(withoutSecret)).toThrow(/JWT_SECRET is required/);
  });

  it('rejects an empty JWT_SECRET', () => {
    expect(() => validateEnv({ ...VALID, JWT_SECRET: '   ' })).toThrow(/JWT_SECRET is required/);
  });

  it('rejects a JWT_SECRET short enough to brute-force', () => {
    expect(() => validateEnv({ ...VALID, JWT_SECRET: 'short' })).toThrow(/at least 32 characters/);
  });

  it('rejects the documented placeholder secrets', () => {
    expect(() =>
      validateEnv({ ...VALID, JWT_SECRET: 'replace-with-a-long-random-string' }),
    ).toThrow(/placeholder/);
  });

  it('rejects a missing DATABASE_URL', () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = VALID;
    expect(() => validateEnv(withoutDb)).toThrow(/DATABASE_URL is required/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...VALID, PORT: 'eighty' })).toThrow(/PORT must be a number/);
  });

  it('accepts an absent PORT, which falls back to the default', () => {
    expect(() => validateEnv({ ...VALID })).not.toThrow();
  });

  it('reports every problem at once rather than one per restart', () => {
    const err = (() => {
      try {
        validateEnv({ JWT_SECRET: 'short', PORT: 'nope' });
        return null;
      } catch (e) {
        return e as Error;
      }
    })();

    expect(err).not.toBeNull();
    expect(err?.message).toContain('DATABASE_URL');
    expect(err?.message).toContain('at least 32 characters');
    expect(err?.message).toContain('PORT');
  });
});
