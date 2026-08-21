import type { DestinationType, PlatformDescriptor, PlatformId } from './types';

/**
 * Every supported platform, keyed exhaustively by {@link PlatformId}.
 *
 * The exhaustive `Record` is the enforcement mechanism for the whole platform
 * layer: adding an id to {@link PlatformId} fails the build here until a
 * complete descriptor is supplied, which is what replaced the eight
 * hand-maintained platform lists scattered across the apps.
 */
export const PLATFORMS: Readonly<Record<PlatformId, PlatformDescriptor>> = {
  LINKEDIN: {
    id: 'LINKEDIN',
    label: 'LinkedIn',
    colorToken: 'bg-chart-1',
    charLimit: 3000,
    connection: 'oauth2',
    reviewStatus: 'GA',
    capabilities: {
      // LinkedIn's public API has no edit endpoint — delete and repost instead.
      edit: false,
      nativeScheduling: [],
      media: { images: 1, video: false, required: false },
      publishFlow: 'direct',
    },
    permalink: (platformPostId) =>
      `https://www.linkedin.com/feed/update/${platformPostId}/`,
  },

  FACEBOOK: {
    id: 'FACEBOOK',
    label: 'Facebook',
    colorToken: 'bg-chart-2',
    // Facebook's real post limit. A previous copy of this value in the web app
    // said `null` (unlimited), so the character counter and the truncating
    // adapter disagreed; 63206 is the correct figure.
    charLimit: 63206,
    connection: 'oauth2',
    reviewStatus: 'GA',
    capabilities: {
      edit: true,
      // Only Pages can be natively scheduled by Meta; personal profiles and
      // Groups cannot, so SyncPost's worker publishes those itself.
      nativeScheduling: ['PAGE'],
      media: { images: 1, video: false, required: false },
      publishFlow: 'direct',
    },
    permalink: (platformPostId) => `https://www.facebook.com/${platformPostId}`,
  },

  X: {
    id: 'X',
    label: 'X (Twitter)',
    colorToken: 'bg-chart-3',
    charLimit: 280,
    connection: 'oauth2-pkce',
    reviewStatus: 'GA',
    capabilities: {
      edit: false,
      nativeScheduling: [],
      // The X publisher posts text only; it does not upload media today.
      media: { images: 0, video: false, required: false },
      publishFlow: 'direct',
    },
    permalink: (platformPostId) =>
      `https://twitter.com/i/web/status/${platformPostId}`,
  },
};

/**
 * All platform ids, in stable display order.
 *
 * Derived from {@link PLATFORMS} rather than written out, so it can never drift
 * from the descriptor set the way the previous hand-written arrays did.
 */
export const ALL_PLATFORM_IDS = Object.keys(PLATFORMS) as readonly PlatformId[];

/** All descriptors, in the same order as {@link ALL_PLATFORM_IDS}. */
export const ALL_PLATFORMS: readonly PlatformDescriptor[] =
  ALL_PLATFORM_IDS.map((id) => PLATFORMS[id]);

/**
 * Looks up a descriptor by id.
 *
 * @param id - A known platform id.
 * @returns The descriptor. Total by construction — no `undefined` case to handle.
 */
export function getPlatform(id: PlatformId): PlatformDescriptor {
  return PLATFORMS[id];
}

/**
 * Whether the provider itself will hold this post and publish it at a future
 * time, rather than SyncPost's worker doing the scheduling.
 *
 * @param platform - The destination's platform.
 * @param destinationType - The destination's type; Meta only offers this for Pages.
 * @returns `true` when the publish call should carry the scheduled time.
 */
export function isNativelySchedulable(
  platform: PlatformId,
  destinationType: DestinationType,
): boolean {
  return PLATFORMS[platform].capabilities.nativeScheduling.includes(destinationType);
}

/**
 * Whether a platform is cleared to be offered to users.
 *
 * @param id - A known platform id.
 * @returns `false` for platforms still awaiting provider app review, which the
 *          UI must disable rather than allow to fail at publish time.
 */
export function isPlatformAvailable(id: PlatformId): boolean {
  return PLATFORMS[id].reviewStatus === 'GA';
}
