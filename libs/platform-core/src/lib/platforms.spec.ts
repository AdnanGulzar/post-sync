import { adaptContentForPlatform, wasAdapted } from './adapt';
import {
  ALL_PLATFORM_IDS,
  PLATFORMS,
  getPlatform,
  isNativelySchedulable,
} from './platforms';
import type { PlatformId } from './types';

describe('PLATFORMS registry invariants', () => {
  it('keys every descriptor by its own id', () => {
    for (const id of ALL_PLATFORM_IDS) {
      expect(PLATFORMS[id].id).toBe(id);
    }
  });

  it('gives every platform a distinct colour token', () => {
    // A duplicate token would make two platforms indistinguishable in charts.
    const tokens = ALL_PLATFORM_IDS.map((id) => PLATFORMS[id].colorToken);
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('gives every platform a non-empty label', () => {
    for (const id of ALL_PLATFORM_IDS) {
      expect(PLATFORMS[id].label.trim()).not.toBe('');
    }
  });

  it('only allows positive character limits', () => {
    for (const id of ALL_PLATFORM_IDS) {
      const limit = PLATFORMS[id].charLimit;
      if (limit !== null) expect(limit).toBeGreaterThan(0);
    }
  });
});

describe('isNativelySchedulable', () => {
  it('is true only for Facebook Pages', () => {
    expect(isNativelySchedulable('FACEBOOK', 'PAGE')).toBe(true);
  });

  it('is false for other Facebook destination types', () => {
    expect(isNativelySchedulable('FACEBOOK', 'PERSONAL')).toBe(false);
    expect(isNativelySchedulable('FACEBOOK', 'GROUP')).toBe(false);
  });

  it('is false for platforms with no native scheduling', () => {
    expect(isNativelySchedulable('LINKEDIN', 'PAGE')).toBe(false);
    expect(isNativelySchedulable('X', 'PERSONAL')).toBe(false);
  });
});

describe('permalink', () => {
  it('builds a platform-appropriate URL for each platform', () => {
    expect(getPlatform('X').permalink('123')).toBe('https://twitter.com/i/web/status/123');
    expect(getPlatform('FACEBOOK').permalink('123')).toBe('https://www.facebook.com/123');
    expect(getPlatform('LINKEDIN').permalink('123')).toBe(
      'https://www.linkedin.com/feed/update/123/',
    );
  });
});

describe('adaptContentForPlatform', () => {
  it('returns short content unchanged apart from whitespace', () => {
    expect(adaptContentForPlatform('  hello  ', 'X')).toBe('hello');
    expect(wasAdapted('hello', 'X')).toBe(false);
  });

  it('truncates to within the limit', () => {
    const long = 'word '.repeat(200).trim();
    const out = adaptContentForPlatform(long, 'X');
    expect(out.length).toBeLessThanOrEqual(280);
    expect(wasAdapted(long, 'X')).toBe(true);
  });

  it('preserves trailing hashtags when truncating', () => {
    const long = `${'word '.repeat(200).trim()} #launch #ship`;
    const out = adaptContentForPlatform(long, 'X');
    expect(out.length).toBeLessThanOrEqual(280);
    expect(out.endsWith('#launch #ship')).toBe(true);
  });

  it('cuts at a word boundary rather than mid-word', () => {
    const long = `${'alpha '.repeat(100).trim()}`;
    const out = adaptContentForPlatform(long, 'X');
    // Everything before the ellipsis must still be whole words.
    const body = out.slice(0, -1);
    expect(body.split(' ').every((w) => w === '' || w === 'alpha')).toBe(true);
  });

  it('leaves content alone for platforms whose limit it fits', () => {
    // 3000 chars fits LinkedIn exactly but not X — the same input, two outcomes.
    const text = 'x'.repeat(3000);
    expect(adaptContentForPlatform(text, 'LINKEDIN')).toBe(text);
    expect(adaptContentForPlatform(text, 'X').length).toBeLessThanOrEqual(280);
  });

  it('never exceeds any platform limit, for every platform', () => {
    const long = 'lorem ipsum dolor sit amet '.repeat(4000);
    for (const id of ALL_PLATFORM_IDS) {
      const limit = PLATFORMS[id].charLimit;
      if (limit === null) continue;
      expect(adaptContentForPlatform(long, id).length).toBeLessThanOrEqual(limit);
    }
  });

  it('uses one shared Facebook limit for both truncation and counting', () => {
    // Regression: the web app previously held two copies of these limits that
    // disagreed on Facebook (63206 vs null), so the counter said "unlimited"
    // while the adapter silently truncated.
    const fb: PlatformId = 'FACEBOOK';
    const limit = PLATFORMS[fb].charLimit;
    expect(limit).toBe(63206);
    const long = 'y'.repeat(70000);
    expect(adaptContentForPlatform(long, fb).length).toBeLessThanOrEqual(limit as number);
  });
});
