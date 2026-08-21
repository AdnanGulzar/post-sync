import { IsISO8601, IsOptional } from 'class-validator';

/**
 * Query parameters for `GET /posts/analytics`.
 *
 * These were free-form `@Query('from')` / `@Query('to')` strings passed
 * straight into `new Date(...)`, so a malformed value produced an Invalid Date
 * that reached the Prisma `where` clause. Validating at the boundary keeps that
 * out of the query layer entirely.
 *
 * Both bounds are optional and independent: omitting `from` means "since the
 * beginning", omitting `to` means "up to now".
 */
export class AnalyticsRangeDto {
  /** Inclusive lower bound on `Post.createdAt`, as an ISO 8601 timestamp. */
  @IsOptional()
  @IsISO8601()
  from?: string;

  /** Inclusive upper bound on `Post.createdAt`, as an ISO 8601 timestamp. */
  @IsOptional()
  @IsISO8601()
  to?: string;
}
