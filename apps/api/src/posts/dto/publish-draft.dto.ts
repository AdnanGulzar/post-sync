import { ArrayMinSize, IsArray, IsISO8601, IsObject, IsOptional, IsString, IsUrl, MinLength, Validate } from 'class-validator';
import { SocialPlatform } from '@prisma/client';
import { IsFutureDateConstraint } from './create-post.dto';

// Turns an existing DRAFT into a real post — publishing it now or scheduling it,
// same as creating one fresh, just against a post that already exists.
export class PublishDraftDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  destinationIds: string[];

  // Any of these override what was saved on the draft; omit to keep it as-is.
  @IsOptional()
  @IsString()
  @MinLength(1)
  content?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @IsOptional()
  @IsObject()
  platformContent?: Partial<Record<SocialPlatform, string>>;

  @IsOptional()
  @IsISO8601()
  @Validate(IsFutureDateConstraint)
  scheduledAt?: string;
}
