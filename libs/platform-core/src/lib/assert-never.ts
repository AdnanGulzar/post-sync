/**
 * Exhaustiveness guard for discriminated unions and `switch` statements.
 *
 * Calling this in a branch the compiler believes is unreachable turns a missing
 * case into a build error rather than a silent fallthrough — the failure mode
 * that let an unhandled platform route to X in the old `if/else` dispatch.
 *
 * @param value - The value TypeScript has narrowed to `never`.
 * @throws {Error} Always, if reached at runtime (i.e. data outside the union).
 * @example
 * switch (outcome.kind) {
 *   case 'done': return outcome.platformPostId;
 *   case 'pending': return null;
 *   default: return assertNever(outcome);
 * }
 */
export function assertNever(value: never): never {
  throw new Error(`Unhandled case: ${JSON.stringify(value)}`);
}
