import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface StateEntry {
  userId: string;
  platform: string;
  codeVerifier?: string;
  expiresAt: number;
}

/**
 * Tracks in-flight OAuth "connect" attempts so the callback can tie the
 * authorization code back to the SyncPost user who started the flow, and
 * (for X/Twitter's PKCE flow) recover the code_verifier.
 *
 * MVP note: this is in-memory, which is fine for a single API instance.
 * If you scale the API horizontally, move this to Redis/Postgres.
 */
@Injectable()
export class OAuthStateService {
  private states = new Map<string, StateEntry>();

  create(userId: string, platform: string, codeVerifier?: string): string {
    const state = randomBytes(24).toString('hex');
    this.states.set(state, {
      userId,
      platform,
      codeVerifier,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    });
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
