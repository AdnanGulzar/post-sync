import { IsUUID } from 'class-validator';

/**
 * Body for `PATCH /stripe/change-plan`.
 *
 * Replaces `@Body('planId') planId: string` plus a hand-rolled `if (!planId)`,
 * which was the only validation this endpoint had.
 */
export class ChangePlanDto {
  /** The free plan to switch to. */
  @IsUUID()
  planId!: string;
}
