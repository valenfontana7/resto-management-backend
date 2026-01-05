import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Increase body size limit for image uploads (10MB)
  app.use(
    bodyParser.json({
      limit: '10mb',
      verify: (req: any, _res: any, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Nota: las imágenes se sirven exclusivamente desde S3 (no desde disco local).

  // CORS: permitir solicitudes desde el frontend y permitir cookies/credenciales
  const normalizeOrigin = (value: string) => {
    const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
    return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  };

  const frontendRaw = (process.env.FRONTEND_URL ?? '').trim();
  const allowedOrigins = frontendRaw
    ? frontendRaw
        .split(',')
        .map((s) => normalizeOrigin(s))
        .filter(Boolean)
    : [];

  const isAllowedOrigin = (origin: string): boolean => {
    const normalized = normalizeOrigin(origin).toLowerCase();
    if (!normalized) return false;

    let originUrl: URL | null = null;
    try {
      originUrl = new URL(normalized);
    } catch {
      originUrl = null;
    }

    const originHostname = originUrl?.hostname?.toLowerCase();
    const originNormalized = originUrl
      ? `${originUrl.protocol}//${originUrl.host}`.toLowerCase()
      : normalized;

    for (const raw of allowedOrigins) {
      const entry = normalizeOrigin(raw).toLowerCase();
      if (!entry) continue;

      if (entry === '*') return true;

      // Wildcard host (e.g. *.vercel.app)
      if (entry.startsWith('*.')) {
        const suffix = entry.slice(1); // ".vercel.app"
        if (originHostname && originHostname.endsWith(suffix)) return true;
        continue;
      }

      // If entry is a full origin (scheme+host), compare origins
      try {
        const entryUrl = new URL(entry);
        const entryNormalized =
          `${entryUrl.protocol}//${entryUrl.host}`.toLowerCase();
        if (originNormalized === entryNormalized) return true;
        continue;
      } catch {
        // Entry is probably a hostname
      }

      // Hostname compare (accept either http or https)
      if (originHostname && originHostname === entry) return true;
    }

    return false;
  };

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g., server-to-server, curl)
      if (!origin) return callback(null, true);

      // If no FRONTEND_URL configured, reflect origin (safe for local dev)
      if (allowedOrigins.length === 0) return callback(null, true);

      if (isAllowedOrigin(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
  });

  const config = new DocumentBuilder()
    .setTitle('Resto Management API')
    .setDescription('The Resto Management API description')
    .setVersion('1.0')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 4000);
}
bootstrap().catch((err) => console.error('Error starting server:', err));
