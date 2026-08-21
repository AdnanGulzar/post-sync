/**
 * Boot-time environment validation.
 *
 * Two failure modes this closes:
 *
 * 1. `JWT_SECRET || 'dev-secret-change-me'` appeared in auth.module.ts and
 *    jwt.strategy.ts. With the variable unset in production the API booted
 *    happily and signed tokens with a publicly-known string, so anyone could
 *    forge an ADMIN token. It now refuses to start.
 * 2. Provider credentials read as `process.env.X || ''`. A missing secret
 *    became an empty string and surfaced much later as an opaque provider 400
 *    during OAuth, rather than as a startup failure naming the variable.
 *
 * Deliberately hand-rolled rather than pulling in Joi or zod: the rules are
 * "present", "long enough" and "parses as a number", and ConfigModule already
 * accepts a plain validate function.
 */

/** Variables without which the API cannot serve a single authenticated request. */
const REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'TOKEN_ENCRYPTION_KEY'] as const;

/**
 * Minimum JWT secret length. Below this a secret is brute-forceable offline,
 * which for an HS256 token means forging any role.
 */
const MIN_JWT_SECRET_LENGTH = 32;

/** Placeholders that must never reach a deployed environment. */
const FORBIDDEN_JWT_SECRETS = ['dev-secret-change-me', 'replace-with-a-long-random-string', 'secret'];

/**
 * Validates the process environment.
 *
 * @param config - Raw environment, as passed by Nest's ConfigModule.
 * @returns The same object, unchanged, when every rule passes.
 * @throws {Error} Listing every problem at once, so a misconfigured deploy is
 *         fixed in one pass rather than one restart per variable.
 */
export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const problems: string[] = [];

  for (const key of REQUIRED) {
    const value = config[key];
    if (typeof value !== 'string' || value.trim() === '') {
      problems.push(`${key} is required but missing or empty.`);
    }
  }

  const jwtSecret = config['JWT_SECRET'];
  if (typeof jwtSecret === 'string' && jwtSecret.trim() !== '') {
    if (jwtSecret.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(
        `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${jwtSecret.length}).`,
      );
    }
    if (FORBIDDEN_JWT_SECRETS.includes(jwtSecret)) {
      problems.push('JWT_SECRET is still set to a documented placeholder value.');
    }
  }

  const encryptionKey = config['TOKEN_ENCRYPTION_KEY'];
  if (typeof encryptionKey === 'string' && encryptionKey.trim() !== '') {
    if (encryptionKey.length < MIN_JWT_SECRET_LENGTH) {
      problems.push(
        `TOKEN_ENCRYPTION_KEY must be at least ${MIN_JWT_SECRET_LENGTH} characters ` +
          `(got ${encryptionKey.length}). It is the only thing protecting stored OAuth tokens.`,
      );
    }
    if (encryptionKey === config['JWT_SECRET']) {
      // Distinct keys mean rotating one does not force rotating the other, and a
      // leaked signing key does not also decrypt every stored token.
      problems.push('TOKEN_ENCRYPTION_KEY must not be the same value as JWT_SECRET.');
    }
  }

  const port = config['PORT'];
  if (port !== undefined && Number.isNaN(Number(port))) {
    problems.push(`PORT must be a number (got ${String(port)}).`);
  }

  if (problems.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}\n` +
        'See .env.example for the full list.',
    );
  }

  return config;
}
