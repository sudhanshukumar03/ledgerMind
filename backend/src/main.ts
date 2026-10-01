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

  // Behind a reverse proxy / load balancer, req.ip must come from
  // X-Forwarded-For for rate limiting to key on the real client. Trust only as
  // many proxy hops as actually front the app — trusting all hops lets clients
  // spoof XFF and evade the limiter. TRUST_PROXY accepts a hop count ("1"),
  // "true"/"false", or an IP/subnet; defaults to 1 in production, off in dev.
  const trustProxyEnv = process.env.TRUST_PROXY;
  const trustProxy =
    trustProxyEnv === undefined
      ? process.env.NODE_ENV === 'production'
      : /^\d+$/.test(trustProxyEnv)
        ? parseInt(trustProxyEnv, 10)
        : trustProxyEnv === 'true'
          ? true
          : trustProxyEnv === 'false'
            ? false
            : trustProxyEnv;
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxy);

  app.use(helmet());
  // Capture the raw body on the request so webhook HMAC verification can run
  // against the exact bytes. A bare json() parser consumes the stream before
  // Nest's rawBody capture, leaving req.rawBody empty — so stash it here.
  app.use(
    json({
      limit: '100kb',
      verify: (req: any, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );

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

  app.enableCors({ origin: frontendUrl || 'http://localhost:3000' });

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
