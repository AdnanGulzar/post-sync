import { Prisma } from '@prisma/client';

/**
 * The only User columns any endpoint may return.
 *
 * Prisma's default `findMany`/`create`/`update` returns every scalar column,
 * including `passwordHash` — so four admin endpoints were serialising every
 * user's bcrypt hash to the admin SPA, where it sat in browser memory and
 * devtools. Selecting explicitly means the hash never leaves the database
 * rather than relying on a serializer to strip it on the way out.
 *
 * `satisfies` keeps the literal's exact keys, so callers still get precise
 * return types, while checking the shape against Prisma — a renamed or removed
 * column fails the build here.
 *
 * @see USER_WITH_SUBSCRIPTION_SELECT for the admin list view.
 */
export const USER_SAFE_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} satisfies Prisma.UserSelect;

/**
 * {@link USER_SAFE_SELECT} plus the relations the admin user list renders.
 *
 * `socialAccounts` deliberately omits the token columns; only the platform and
 * connection time are needed to show which accounts a user has linked.
 */
export const USER_WITH_SUBSCRIPTION_SELECT = {
  ...USER_SAFE_SELECT,
  subscription: { include: { plan: true } },
  socialAccounts: { select: { platform: true, connectedAt: true } },
} satisfies Prisma.UserSelect;
