import { BadRequestException } from '@nestjs/common';
import { ParseEntityIdPipe } from './parse-entity-id.pipe';

describe('ParseEntityIdPipe', () => {
  const pipe = new ParseEntityIdPipe();

  it('accepts a generated v4 id', () => {
    const id = 'a94dc3f0-f445-4155-bc10-7a3df9fdc6be';
    expect(pipe.transform(id)).toBe(id);
  });

  it('accepts the seeded well-known plan ids', () => {
    // Regression: Nest's ParseUUIDPipe and a bare @IsUUID() both reject these,
    // because the version nibble is 0. Validating for v4 made every seeded plan
    // unreachable through billing and plan admin.
    for (const n of ['1', '2', '3', '4']) {
      const id = `00000000-0000-0000-0000-00000000000${n}`;
      expect(pipe.transform(id)).toBe(id);
    }
  });

  it('rejects a non-uuid', () => {
    expect(() => pipe.transform('not-a-uuid')).toThrow(BadRequestException);
  });

  it('rejects a uuid with a wrong-length group', () => {
    expect(() => pipe.transform('00000000-0000-0000-0000-0000000001')).toThrow(BadRequestException);
  });

  it('rejects non-hex characters', () => {
    expect(() => pipe.transform('zzzzzzzz-0000-0000-0000-000000000001')).toThrow(BadRequestException);
  });

  it('rejects an empty string', () => {
    expect(() => pipe.transform('')).toThrow(BadRequestException);
  });
});
