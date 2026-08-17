import { ArrayMinSize, IsArray, IsEnum, IsISO8601, IsObject, IsOptional, IsString, IsUrl, MinLength, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';
import { SocialPlatform } from '@prisma/client';

@ValidatorConstraint({ name: 'isFutureDate', async: false })
class IsFutureDateConstraint implements ValidatorConstraintInterface {
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
  content: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(SocialPlatform, { each: true })
  platforms: SocialPlatform[];

  // require_tld: false so local dev upload URLs (http://localhost:PORT/uploads/...) validate too.
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  // Per-platform overrides of `content` (e.g. a version shortened to fit X's 280-char
  // limit). A platform without an entry here just publishes `content` as-is.
  @IsOptional()
  @IsObject()
  platformContent?: Partial<Record<SocialPlatform, string>>;

  // When set, the post is saved as SCHEDULED and published later by the scheduler cron
  // instead of being published immediately.
  @IsOptional()
  @IsISO8601()
  @Validate(IsFutureDateConstraint)
  scheduledAt?: string;
}
