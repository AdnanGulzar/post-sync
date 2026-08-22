import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ALL_PLATFORM_IDS, type PlatformDescriptor, type PlatformId } from '@syncpost/platform-core';
import type { SocialPlatformService } from '../publisher.interface';

/**
 * Multi-provider token every platform publisher registers itself under.
 *
 * Publishers are collected by DI rather than listed by hand, so adding one no
 * longer means editing a constructor parameter list and a map literal in
 * SocialService.
 */
export const PLATFORM_PUBLISHER = Symbol('PLATFORM_PUBLISHER');

/** A publisher that knows which platform it serves. */
export interface PlatformPublisher extends SocialPlatformService {
  readonly descriptor: PlatformDescriptor;
}

/**
 * Resolves a platform id to its publisher.
 *
 * Replaces the hand-built `Record<SocialPlatform, SocialPlatformService>` that
 * SocialService assembled in its constructor, and the `if/else` chain in
 * AuthService whose trailing `else` silently routed any unrecognised platform
 * to X.
 */
@Injectable()
export class PublisherRegistry implements OnModuleInit {
  private readonly byPlatform = new Map<PlatformId, PlatformPublisher>();

  constructor(
    @Inject(PLATFORM_PUBLISHER) private readonly publishers: readonly PlatformPublisher[],
  ) {}

  /**
   * Indexes the registered publishers and refuses to start if the set does not
   * match the platform registry.
   *
   * Failing at boot rather than at publish time means a half-added platform is
   * caught by any deploy or integration test, instead of surfacing as a failed
   * post for whoever connected it first.
   *
   * @throws {Error} If two publishers claim the same platform, or if a platform
   *                 in `PLATFORMS` has no publisher.
   */
  onModuleInit(): void {
    for (const publisher of this.publishers) {
      const id = publisher.descriptor.id;
      const existing = this.byPlatform.get(id);
      if (existing) {
        throw new Error(
          `Two publishers registered for ${id}: ${existing.constructor.name} and ${publisher.constructor.name}.`,
        );
      }
      this.byPlatform.set(id, publisher);
    }

    const missing = ALL_PLATFORM_IDS.filter((id) => !this.byPlatform.has(id));
    if (missing.length > 0) {
      throw new Error(
        `No publisher registered for: ${missing.join(', ')}. ` +
          `Every platform in PLATFORMS needs an implementation provided under PLATFORM_PUBLISHER.`,
      );
    }
  }

  /**
   * @param platform - The platform to publish to.
   * @returns That platform's publisher.
   * @throws {BadRequestException} If the platform has no publisher. Unreachable
   *         once {@link onModuleInit} has run, but kept so a direct call before
   *         initialisation fails loudly rather than returning undefined.
   */
  for(platform: PlatformId): PlatformPublisher {
    const publisher = this.byPlatform.get(platform);
    if (!publisher) throw new BadRequestException(`Unsupported platform: ${platform}`);
    return publisher;
  }

  /** Every registered publisher, for capability-driven iteration. */
  all(): readonly PlatformPublisher[] {
    return [...this.byPlatform.values()];
  }
}
