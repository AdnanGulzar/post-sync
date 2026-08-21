/**
 * Canonical URLs of the two web apps.
 *
 * These drive CORS *and* every OAuth/Stripe redirect, so a mismatch does not
 * fail loudly — it shows up as a blocked request or a redirect to a dead port.
 *
 * They previously had three different defaults across the codebase (`:4200`,
 * `:4201`, `:4220`) while the Vite dev servers actually listen on 4220 and
 * 4230, so a fresh checkout following the README got CORS-blocked frontends.
 * Defined once here to keep that from drifting again.
 *
 * @see apps/user/vite.config.mts and apps/admin/vite.config.mts for the ports.
 */

/** Matches `server.port` in apps/user/vite.config.mts. */
export const DEFAULT_USER_APP_URL = 'http://localhost:4220';

/** Matches `server.port` in apps/admin/vite.config.mts. */
export const DEFAULT_ADMIN_APP_URL = 'http://localhost:4230';

/**
 * @returns The user panel's base URL, from `USER_APP_URL` or the dev default.
 */
export function userAppUrl(): string {
  return process.env.USER_APP_URL || DEFAULT_USER_APP_URL;
}

/**
 * @returns The admin panel's base URL, from `ADMIN_APP_URL` or the dev default.
 */
export function adminAppUrl(): string {
  return process.env.ADMIN_APP_URL || DEFAULT_ADMIN_APP_URL;
}
