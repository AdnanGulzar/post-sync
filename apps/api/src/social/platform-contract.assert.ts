import type { DestinationType, SocialPlatform } from '@prisma/client';
import type {
  DestinationType as CorePlatformDestinationType,
  PlatformId,
} from '@syncpost/platform-core';

/**
 * True only when `A` and `B` are mutually assignable — a stricter check than
 * `extends`, which would accept a union that merely covers the other.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless `T` is exactly `true`. */
type Assert<T extends true> = T;

/**
 * Binds the browser-safe unions in `@syncpost/platform-core` to the Prisma
 * enums they mirror.
 *
 * The web apps cannot import `@prisma/client`, so the unions are declared
 * independently and could silently drift — adding a platform to the database
 * enum while the registry and both UIs still know only the old set. These
 * assertions turn that drift into a build failure here, in the one place that
 * can legitimately see both sides.
 *
 * If this file stops compiling, reconcile `PlatformId` in
 * `libs/platform-core/src/lib/types.ts` with the Prisma schema — and supply the
 * missing descriptor, which `PLATFORMS` will separately demand.
 */
type _PlatformIdsMatchPrisma = Assert<Equals<PlatformId, SocialPlatform>>;
type _DestinationTypesMatchPrisma = Assert<Equals<CorePlatformDestinationType, DestinationType>>;
