import { IsOptional, IsUUID } from 'class-validator';
import { ENTITY_ID_UUID_MODE } from '../../common/pipes/parse-entity-id.pipe';

/**
 * Body for `POST /stripe/checkout-session`.
 *
 * Previously read as `@Body('planId') planId?: string`. A keyed `@Body('x')`
 * whose metatype is a primitive is skipped by the global ValidationPipe
 * entirely, so `whitelist` and `forbidNonWhitelisted` did nothing and any value
 * of any shape reached the handler.
 */
export class CheckoutSessionDto {
  /**
   * Plan to check out. Omitted means "re-open checkout for the plan already on
   * the subscription", which is the abandoned-checkout path.
   */
  @IsOptional()
  @IsUUID(ENTITY_ID_UUID_MODE)
  planId?: string;
}
