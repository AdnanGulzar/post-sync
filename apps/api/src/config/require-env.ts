/**
 * Reads a required environment variable.
 *
 * Used where a missing value must be a hard failure rather than a silent
 * default — chiefly JWT_SECRET, which previously fell back to a hardcoded
 * string. {@link validateEnv} already fails the boot for these, so this is the
 * second line of defence and keeps the call site honest about the type.
 *
 * @param key - The variable name.
 * @returns The value, guaranteed non-empty.
 * @throws {Error} If unset or empty.
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(`${key} is not set. The API cannot start without it.`);
  }
  return value;
}
