import { Role } from '@prisma/client';

/**
 * The shape {@link JwtStrategy.validate} attaches to the request, and therefore
 * exactly what `@CurrentUser()` yields.
 *
 * Controllers previously typed this parameter as `any`, so a typo in a property
 * name compiled fine and failed at runtime. `role` in particular is read by
 * authorisation logic and is re-read from the database on every request rather
 * than trusted from the token, so it is always current.
 */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly name: string;
}
