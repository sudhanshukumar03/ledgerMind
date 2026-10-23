import { NestFactory } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation.js';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

import helmet from 'helmet';
import { json } from 'express';

(BigInt.prototype as any).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  // Load the selected cwd .env before importing Prisma/application modules.
  // Prisma's implicit env loader must not choose a different checkout target.
  await ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment });
  const { AppModule } = await import('./app.module.js');
  const app = await NestFactory.create(AppModule, {
    rawBody: true, // ← Required for webhook HMAC verification
  });

  app.enableShutdownHooks();

  // Behind a reverse proxy / load balancer, req.ip must come from
  // X-Forwarded-For for rate limiting to key on the real client. Trust only as
  // many proxy hops as actually front the app — trusting all hops lets clients
  // spoof XFF and evade the limiter. TRUST_PROXY accepts a hop count ("1"),
  // "true"/"false", or an IP/subnet; defaults to off; configure actual proxy hops explicitly.
  const trustProxyEnv = process.env.TRUST_PROXY;
  const trustProxy = !trustProxyEnv
    ? false
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

  // Swagger exposes the full API surface. Serve it only outside production so
  // the /api docs can't be scraped as an unauthenticated reconnaissance aid on
  // a live deployment. Set SWAGGER_ENABLED=true to opt back in explicitly.
  if (
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true'
  ) {
    const config = new DocumentBuilder()
      .setTitle('LedgerMind API')
      .setVersion('1.0')
      .build();
    let document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document);
  }

  const frontendUrl = process.env.FRONTEND_URL;
  if (process.env.NODE_ENV === 'production' && !frontendUrl) {
    throw new Error('FRONTEND_URL must be set in production');
  }

  app.enableCors({ origin: frontendUrl || 'http://localhost:3000' });

  await app.listen(
    process.env.PORT || 3001,
    process.env.BIND_ADDRESS || '0.0.0.0',
  );
}
bootstrap();
