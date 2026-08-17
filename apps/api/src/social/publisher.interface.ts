import { SocialAccount } from '@prisma/client';

export interface PublishResult {
  platformPostId: string;
}

export interface SocialPlatformService {
  /** Builds the provider's OAuth "authorize" URL the user's browser should be sent to. */
  getAuthUrl(state: string, codeVerifier?: string): string;

  /**
   * Exchanges the authorization `code` from the provider's redirect for tokens,
   * fetches the connecting account's basic profile, and returns everything
   * needed to persist a SocialAccount row.
   */
  handleCallback(
    code: string,
    codeVerifier?: string,
  ): Promise<{
    platformUserId: string;
    platformUsername?: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    metadata?: Record<string, unknown>;
  }>;

  /**
   * Publishes `content` (and optional image) using a previously connected account.
   * When `scheduledAt` is passed and the platform supports native scheduling
   * (see NATIVELY_SCHEDULABLE_PLATFORMS), the provider itself holds and publishes
   * the post at that time instead of publishing immediately.
   */
  publish(account: SocialAccount, content: string, imageUrl?: string, scheduledAt?: Date): Promise<PublishResult>;

  /** Deletes a previously published (or natively-scheduled) post on the platform. */
  deletePost(account: SocialAccount, platformPostId: string): Promise<void>;

  /**
   * Edits the text of a previously published post. Not every platform's public API
   * supports this — implementations that don't must throw a clear, user-facing error
   * rather than silently no-op.
   */
  editPost(account: SocialAccount, platformPostId: string, content: string): Promise<void>;
}
