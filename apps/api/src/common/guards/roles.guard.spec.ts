import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

/**
 * Builds a minimal ExecutionContext carrying `user` on the request, which is
 * all RolesGuard reads.
 */
function contextFor(user: { role: Role } | null): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(requiredRoles: Role[] | undefined): RolesGuard {
  const reflector = { getAllAndOverride: () => requiredRoles } as unknown as Reflector;
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('allows a route with no @Roles metadata', () => {
    expect(guardWith(undefined).canActivate(contextFor({ role: 'USER' }))).toBe(true);
  });

  it('allows a route whose @Roles list is empty', () => {
    expect(guardWith([]).canActivate(contextFor({ role: 'USER' }))).toBe(true);
  });

  it('allows a user holding the required role', () => {
    expect(guardWith(['ADMIN']).canActivate(contextFor({ role: 'ADMIN' }))).toBe(true);
  });

  it('rejects a user without the required role', () => {
    expect(() => guardWith(['ADMIN']).canActivate(contextFor({ role: 'USER' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects an unauthenticated request rather than reading role off undefined', () => {
    // Guard order is not enforced by the type system, so RolesGuard must be
    // safe even if it somehow runs before authentication populated `user`.
    expect(() => guardWith(['ADMIN']).canActivate(contextFor(null))).toThrow(ForbiddenException);
  });
});
