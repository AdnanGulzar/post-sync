import { Test } from '@nestjs/testing';

/**
 * Compiles the whole dependency graph.
 *
 * Three defects reached a branch that passed lint, typecheck and every unit
 * test, because all three were resolution failures that only surface when Nest
 * builds the container:
 *
 *  - HttpClient took `timeoutMs: number = ...`, so Nest tried to inject Number.
 *  - Publishers were registered with `multi: true`, which is an Angular concept;
 *    the token resolved to one object and the registry threw "not iterable".
 *  - TokenCrypto took an optional `secret?: string`, so Nest tried to inject String.
 *
 * `compile()` builds the graph without calling onModuleInit, so this needs no
 * database — it fails on wiring, not on connectivity.
 */
describe('AppModule', () => {
  const REQUIRED_ENV = {
    DATABASE_URL: 'postgresql://localhost:5432/unused',
    JWT_SECRET: 'test-only-jwt-secret-value-padded-to-32+',
    TOKEN_ENCRYPTION_KEY: 'test-only-distinct-encryption-key-32ch+',
  };

  let saved: Record<string, string | undefined>;

  beforeAll(() => {
    saved = Object.fromEntries(Object.keys(REQUIRED_ENV).map((k) => [k, process.env[k]]));
    Object.assign(process.env, REQUIRED_ENV);
  });

  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('resolves every provider in the container', async () => {
    // Imported dynamically, after the env is in place: auth.module.ts calls
    // requireEnv('JWT_SECRET') at module scope, so a static import would
    // evaluate it before any setup could run.
    const { AppModule } = await import('./app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
