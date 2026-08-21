/**
 * Framework-free platform contracts shared by the API and both web apps.
 *
 * Nothing in this file may import from `@prisma/client`, React, or NestJS — the
 * browser bundles depend on it. The API binds these unions back to the Prisma
 * enums with a compile-time assertion (see `platform-registry.assert.ts`).
 */

/**
 * Every social platform SyncPost can publish to.
 *
 * Adding a member here is deliberately a breaking change: {@link PLATFORMS} is
 * keyed by an exhaustive `Record`, so the build fails until a full descriptor
 * exists, and the API's Prisma assertion fails until the enum matches.
 */
export type PlatformId = 'LINKEDIN' | 'FACEBOOK' | 'X';

/**
 * A specific postable target within a connected account — a personal profile, a
 * Page, or a Group. One OAuth grant can yield several.
 */
export type DestinationType = 'PERSONAL' | 'PAGE' | 'GROUP';

/**
 * How a platform's account connection is established. Not every platform uses
 * OAuth 2.0 authorization-code, so publishers must never assume it.
 *
 * - `oauth2` — standard authorization-code exchange.
 * - `oauth2-pkce` — authorization-code with a PKCE verifier/challenge pair (X).
 * - `app-password` — user-supplied credential exchanged for a session (Bluesky).
 * - `instance-oauth` — OAuth against a user-supplied host (Mastodon), so the
 *   client must be registered per instance before the flow can start.
 * - `webhook` — a user-supplied endpoint URL; no account grant at all (Discord).
 */
export type ConnectionKind =
  | 'oauth2'
  | 'oauth2-pkce'
  | 'app-password'
  | 'instance-oauth'
  | 'webhook';

/**
 * Whether a platform is cleared for real use.
 *
 * `PENDING_APP_REVIEW` platforms are implemented and sandbox-tested but must be
 * disabled in the UI: publishing would either fail or, on TikTok, silently
 * succeed as `SELF_ONLY` with nothing in the API signalling it.
 */
export type ReviewStatus = 'GA' | 'PENDING_APP_REVIEW' | 'SANDBOX_ONLY';

/**
 * Whether a publish completes in one call or needs polling.
 *
 * `async-container` platforms (Instagram, TikTok, YouTube) return a handle that
 * the publishing worker polls until it reaches a terminal state.
 */
export type PublishFlow = 'direct' | 'async-container';

/** What a platform's API will accept as attached media on a post. */
export interface MediaSupport {
  /** Maximum images per post. `0` means the publisher ignores `imageUrl` entirely. */
  readonly images: number;
  /** Whether the platform accepts video uploads. */
  readonly video: boolean;
  /** Whether a post is rejected without media (true for TikTok/YouTube). */
  readonly required: boolean;
}

/** What a platform can do, so callers can ask before calling rather than catching. */
export interface PlatformCapabilities {
  /**
   * Whether an already-published post's text can be edited in place.
   * When `false`, callers should offer delete-and-repost instead.
   */
  readonly edit: boolean;
  /**
   * Destination types whose provider will hold a post and publish it itself at a
   * future time. Empty means SyncPost's own worker must do the scheduling.
   *
   * Replaces the former `isNativelySchedulable(platform, destinationType)`.
   */
  readonly nativeScheduling: readonly DestinationType[];
  readonly media: MediaSupport;
  readonly publishFlow: PublishFlow;
}

/**
 * The single source of truth for one platform — consumed by the API's publisher
 * registry and by both web apps for labels, colours, limits and permalinks.
 *
 * This replaces six separately-maintained copies of platform metadata that had
 * already drifted (two disagreeing character-limit maps).
 */
export interface PlatformDescriptor {
  readonly id: PlatformId;
  /** Human-facing name. The only place a platform's display name is defined. */
  readonly label: string;
  /**
   * Tailwind background token for this platform's fixed categorical colour,
   * e.g. `bg-chart-1`. Each platform needs a distinct token, so the theme must
   * define at least as many `--chart-*` values as there are platforms.
   */
  readonly colorToken: string;
  /** Maximum post length in characters, or `null` when the platform is unbounded. */
  readonly charLimit: number | null;
  readonly connection: ConnectionKind;
  readonly reviewStatus: ReviewStatus;
  readonly capabilities: PlatformCapabilities;
  /**
   * Builds a public URL for a published post.
   *
   * @param platformPostId - The provider's own post id, as stored on `PostPublishResult`.
   * @param handle - The account handle, when the platform's URL scheme needs it.
   * @returns An absolute URL, or `null` when this platform/destination has no
   *          addressable permalink (e.g. LinkedIn Company Pages).
   */
  readonly permalink: (platformPostId: string, handle?: string) => string | null;
}
