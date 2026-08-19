import {
  BadRequestException,
  Controller,
  InternalServerErrorException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadApiResponse, v2 as cloudinary } from 'cloudinary';
// Side-effect import: pulls in @types/multer's `Express.Multer.File` global
// augmentation, which this file needs but no longer imports at runtime.
import 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

const ALLOWED_MIME = /^image\/(png|jpe?g|gif|webp)$/;

// Configured lazily so missing Cloudinary env vars only break an upload
// request, not the whole API's startup.
function getCloudinary() {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;
  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw new InternalServerErrorException('Cloudinary is not configured on the server.');
  }
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  return cloudinary;
}

@Controller('uploads')
export class UploadsController {
  // No disk storage — FileInterceptor defaults to in-memory buffering, which we
  // stream straight to Cloudinary. Keeps this working on hosts with ephemeral or
  // read-only filesystems, and gives back a publicly fetchable URL the social
  // publishers need anyway (they download the image from imageUrl to repost it).
  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME.test(file.mimetype)) {
          return cb(new BadRequestException('Only PNG, JPEG, GIF, or WEBP images are allowed'), false);
        }
        cb(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');

    const client = getCloudinary();
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = client.uploader.upload_stream({ folder: 'syncpost', resource_type: 'image' }, (err, res) =>
        err || !res ? reject(err) : resolve(res),
      );
      stream.end(file.buffer);
    });

    return { url: result.secure_url };
  }
}
