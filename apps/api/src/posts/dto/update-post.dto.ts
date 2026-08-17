import { IsString, MinLength } from 'class-validator';

export class UpdatePostDto {
  @IsString()
  @MinLength(1)
  content: string;
}
