/**
 * Reads a human-readable message from an unknown caught value.
 *
 * `catch (err: any)` silences the compiler but also silences it about
 * `err.message` on a value that may be a string, a rejected non-Error, or
 * undefined. Catching as `unknown` and narrowing here keeps the call sites
 * honest without repeating the check.
 *
 * @param err - Any caught value.
 * @param fallback - Returned when no message can be recovered.
 * @returns The error's message, or `fallback`.
 * @example
 * } catch (err: unknown) {
 *   this.logger.error(errorMessage(err, 'publish failed'));
 * }
 */
export function errorMessage(err: unknown, fallback = 'Unknown error'): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === 'string' && err) return err;
  return fallback;
}
