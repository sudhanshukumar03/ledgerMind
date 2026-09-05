import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

import helmet from 'helmet';
import { json } from 'express';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // ← Required for webhook HMAC verification
  });

  app.use(helmet());
  app.use(json({ limit: '100kb' }));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  const config = new DocumentBuilder()
    .setTitle('LedgerMind API')
    .setVersion('1.0')
    .build();
  let document = SwaggerModule.createDocument(app, config);
  document = cleanupOpenApiDoc(document);
  SwaggerModule.setup('api', app, document);

  const frontendUrl = process.env.FRONTEND_URL;
  if (process.env.NODE_ENV === 'production' && !frontendUrl) {
    throw new Error('FRONTEND_URL must be set in production');
  }

  app.enableCors({ origin: frontendUrl || 'http://localhost:3001' });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
