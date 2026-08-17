import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface StateEntry {
  platform: string;
  codeVerifier?: string;
  expiresAt: number;
}

/**
 * Tracks in-flight "sign up / log in with <platform>" OAuth attempts.
 * Unlike social/oauth-state.service.ts (which ties a connect attempt to an
 * already-logged-in userId), there is no user yet here — only the platform
 * and, for X, the PKCE code_verifier.
 *
 * MVP note: in-memory, fine for a single API instance. Move to
 * Redis/Postgres if you scale the API horizontally.
 */
@Injectable()
export class OAuthSignupStateService {
  private states = new Map<string, StateEntry>();

  create(platform: string, codeVerifier?: string): string {
    const state = randomBytes(24).toString('hex');
    this.states.set(state, { platform, codeVerifier, expiresAt: Date.now() + 10 * 60 * 1000 });
    return state;
  }

  consume(state: string): StateEntry | null {
    const entry = this.states.get(state);
    if (!entry) return null;
    this.states.delete(state);
    if (entry.expiresAt < Date.now()) return null;
    return entry;
  }
}
