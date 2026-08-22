import { ALL_PLATFORM_IDS, PLATFORMS } from '@syncpost/platform-core';
import { PublisherRegistry, type PlatformPublisher } from './publisher.registry';

/** A publisher stub that claims one platform. */
function stubFor(id: keyof typeof PLATFORMS): PlatformPublisher {
  return { descriptor: PLATFORMS[id] } as PlatformPublisher;
}

describe('PublisherRegistry', () => {
  it('resolves each registered platform to its own publisher', () => {
    const stubs = ALL_PLATFORM_IDS.map(stubFor);
    const registry = new PublisherRegistry(stubs);
    registry.onModuleInit();

    for (const id of ALL_PLATFORM_IDS) {
      expect(registry.for(id).descriptor.id).toBe(id);
    }
  });

  it('refuses to boot when a platform has no publisher', () => {
    // The failure mode this replaces: a half-added platform that boots fine and
    // only fails for whoever connects it first.
    const incomplete = ALL_PLATFORM_IDS.slice(1).map(stubFor);
    // A fresh registry per assertion: onModuleInit populates the instance, so
    // re-running it would report a duplicate rather than the missing platform.
    expect(() => new PublisherRegistry(incomplete).onModuleInit()).toThrow(
      /No publisher registered for/,
    );
    expect(() => new PublisherRegistry(incomplete).onModuleInit()).toThrow(
      ALL_PLATFORM_IDS[0] as string,
    );
  });

  it('refuses to boot when two publishers claim the same platform', () => {
    const duplicated = [...ALL_PLATFORM_IDS.map(stubFor), stubFor('X')];
    const registry = new PublisherRegistry(duplicated);

    expect(() => registry.onModuleInit()).toThrow(/Two publishers registered for X/);
  });

  it('exposes every publisher for capability-driven iteration', () => {
    const registry = new PublisherRegistry(ALL_PLATFORM_IDS.map(stubFor));
    registry.onModuleInit();

    expect(registry.all()).toHaveLength(ALL_PLATFORM_IDS.length);
  });
});
