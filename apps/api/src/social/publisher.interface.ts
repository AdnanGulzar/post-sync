import { DestinationType, SocialAccount } from '@prisma/client';

export interface PublishResult {
  platformPostId: string;
}

// Every field is optional because not every platform's API exposes every metric
// (e.g. LinkedIn's socialActions endpoint has no share/impression count).
export interface PostMetrics {
  likes?: number;
  comments?: number;
  shares?: number;
  impressions?: number;
}

export interface ConnectedDestination {
  platformUserId: string;
  platformUsername?: string;
  destinationType: DestinationType;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  metadata?: Record<string, unknown>;
}

export interface SocialPlatformService {
  /** Builds the provider's OAuth "authorize" URL the user's browser should be sent to. */
  getAuthUrl(state: string, codeVerifier?: string): string;

  /**
   * Exchanges the authorization `code` from the provider's redirect for tokens, then
   * discovers every destination (personal account, Pages, Groups, etc.) the grant gives
   * access to. A single connect attempt can surface more than one — e.g. several
   * Facebook Pages, or a personal profile plus a Company Page — each becomes its own
   * SocialAccount row. Always returns at least one entry when the grant itself succeeded;
   * a provider that finds zero postable destinations should throw instead of returning [].
   */
  handleCallback(code: string, codeVerifier?: string): Promise<ConnectedDestination[]>;

  /**
   * Publishes `content` (and optional image) to this specific destination.
   * When `scheduledAt` is passed and the destination supports native scheduling
   * (see isNativelySchedulable), the provider itself holds and publishes the post
   * at that time instead of publishing immediately.
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

  /** Fetches current engagement metrics for a previously published post, live from the platform's API. */
  getMetrics(account: SocialAccount, platformPostId: string): Promise<PostMetrics>;
}
