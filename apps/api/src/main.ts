import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as express from 'express';
import { AppModule } from './app/app.module';
import { UPLOAD_DIR } from './uploads/uploads.controller';

async function bootstrap() {
  // rawBody: true keeps the original request bytes around (on req.rawBody) alongside
  // Nest's normal JSON parsing, so the Stripe webhook handler can verify its signature
  // against the exact payload Stripe signed.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.enableCors({
    origin: [
      process.env.USER_APP_URL || 'http://localhost:4200',
      process.env.ADMIN_APP_URL || 'http://localhost:4201',
    ],
    credentials: true,
  });

  app.use('/uploads', express.static(UPLOAD_DIR));

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);
  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 SyncPost API running on: http://localhost:${port}/${globalPrefix}`);
}

bootstrap();
