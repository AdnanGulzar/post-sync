import { IsArray, IsBoolean, IsISO8601, IsObject, IsOptional, IsString, IsUrl, MinLength, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { SocialPlatform } from '@prisma/client';

@ValidatorConstraint({ name: 'isFutureDate', async: false })
export class IsFutureDateConstraint implements ValidatorConstraintInterface {
  validate(value: string) {
    return new Date(value).getTime() > Date.now();
  }
  defaultMessage() {
    return 'scheduledAt must be a date in the future';
  }
}

export class CreatePostDto {
  @IsString()
  @MinLength(1)
  content!: string;

  // The specific connected destinations (SocialAccount ids) to publish to — a user
  // can pick e.g. one Facebook Page but not another, or a Page and a Group at once.
  // Optional only when saveAsDraft is set — a draft doesn't have to target anything
  // yet; the service enforces "at least 1" itself for the actual-publish path.
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  destinationIds?: string[];

  // require_tld: false so local dev upload URLs (http://localhost:PORT/uploads/...) validate too.
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  // Per-platform overrides of `content` (e.g. a version shortened to fit X's 280-char
  // limit). A platform without an entry here just publishes `content` as-is. Shared
  // across every destination on that platform, regardless of destination type.
  @IsOptional()
  @IsObject()
  platformContent?: Partial<Record<SocialPlatform, string>>;

  // When set, the post is saved as SCHEDULED and published later by the scheduler cron
  // instead of being published immediately. Ignored when saveAsDraft is set.
  @IsOptional()
  @IsISO8601()
  @Validate(IsFutureDateConstraint)
  scheduledAt?: string;

  // Saves the post as a DRAFT instead of publishing/scheduling it — no destinations
  // or content limit checks apply. Publish it later via POST /posts/:id/publish.
  @IsOptional()
  @IsBoolean()
  saveAsDraft?: boolean;
}
