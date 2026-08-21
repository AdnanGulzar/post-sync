import { PLATFORMS } from './platforms';
import type { PlatformId } from './types';

/** Appended to truncated content to signal it was shortened. */
const ELLIPSIS = '…';

/**
 * Deterministically shortens content to fit a platform's character limit.
 *
 * No AI involved: it trims at a word boundary and preserves any trailing hashtag
 * run, since losing hashtags costs more reach than losing a few words. Content
 * that already fits — or that targets an unbounded platform — is returned
 * unchanged apart from surrounding whitespace.
 *
 * @param content - The author's text, in full.
 * @param platform - The destination platform whose limit applies.
 * @returns Text guaranteed to be within the platform's `charLimit`.
 * @example
 * adaptContentForPlatform('a'.repeat(400) + ' #hi', 'X'); // 280 chars, '#hi' kept
 */
export function adaptContentForPlatform(content: string, platform: PlatformId): string {
  const trimmed = content.trim();
  const limit = PLATFORMS[platform].charLimit;
  if (limit === null || trimmed.length <= limit) return trimmed;

  const hashtagMatch = trimmed.match(/(?:\s+#\w+)+\s*$/);
  const hashtags = hashtagMatch ? hashtagMatch[0].trim() : '';
  const body = hashtagMatch
    ? trimmed.slice(0, trimmed.length - hashtagMatch[0].length).trim()
    : trimmed;

  // Reserve room for the hashtags plus the space that rejoins them to the body.
  const reserved = hashtags ? hashtags.length + 1 : 0;
  const maxBodyLength = Math.max(0, limit - ELLIPSIS.length - reserved);

  let cut = body.slice(0, maxBodyLength);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > 0) cut = cut.slice(0, lastSpace);

  const shortened = `${cut}${ELLIPSIS}`;
  return hashtags ? `${shortened} ${hashtags}` : shortened;
}

/**
 * Adapts one piece of content for several platforms at once.
 *
 * @param content - The author's text, in full.
 * @param platforms - Target platforms; duplicates are collapsed by the result shape.
 * @returns A map of platform id to that platform's adapted text.
 */
export function adaptForPlatforms(
  content: string,
  platforms: readonly PlatformId[],
): Partial<Record<PlatformId, string>> {
  const result: Partial<Record<PlatformId, string>> = {};
  for (const platform of platforms) {
    result[platform] = adaptContentForPlatform(content, platform);
  }
  return result;
}

/**
 * Whether adapting would actually change the content, for showing a
 * "this will be shortened" warning before the user commits.
 *
 * @param content - The author's text, in full.
 * @param platform - The destination platform whose limit applies.
 * @returns `true` when the platform would receive different text.
 */
export function wasAdapted(content: string, platform: PlatformId): boolean {
  return adaptContentForPlatform(content, platform) !== content.trim();
}
