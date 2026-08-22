import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { isUUID } from 'class-validator';

/**
 * UUID mode used for every entity id in this API.
 *
 * `loose` accepts the canonical 8-4-4-4-12 hex form regardless of the version
 * nibble. The stricter default rejects the seeded plan ids
 * (`00000000-0000-0000-0000-000000000001` and siblings), which are deliberate
 * well-known constants rather than generated v4 values — so validating for v4
 * would make every seeded plan unreachable through billing and plan admin.
 *
 * DTOs pair with this via `@IsUUID(ENTITY_ID_UUID_MODE)`, so the route params
 * and the request bodies enforce exactly the same rule.
 */
export const ENTITY_ID_UUID_MODE = 'loose' as const;

/**
 * Validates that a route parameter is an entity id.
 *
 * Replaces Nest's `ParseUUIDPipe`, whose `version` option only accepts
 * '3' | '4' | '5' | '7' and therefore cannot express the loose mode.
 */
@Injectable()
export class ParseEntityIdPipe implements PipeTransform<string, string> {
  /**
   * @param value - The raw route parameter.
   * @returns The value unchanged when it is a well-formed id.
   * @throws {BadRequestException} When it is not, so a malformed id becomes a
   *         400 rather than reaching Prisma as a lookup that returns nothing.
   */
  transform(value: string): string {
    if (!isUUID(value, ENTITY_ID_UUID_MODE)) {
      throw new BadRequestException('Validation failed (uuid is expected)');
    }
    return value;
  }
}
