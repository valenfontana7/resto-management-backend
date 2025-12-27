import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import type { Request, Response, NextFunction } from 'express';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Increase body size limit for image uploads (10MB)
  app.use(
    bodyParser.json({
      limit: '10mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Servir archivos estáticos desde la carpeta uploads
  const uploadsPath = join(process.cwd(), 'uploads');
  console.log('📁 Serving static files from:', uploadsPath);
  app.useStaticAssets(uploadsPath, {
    prefix: '/uploads/',
  });

  // Reescribe peticiones que NO empiecen por /api hacia /api/...
  // Excluye recursos estáticos, documentación y rutas internas.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const url = req.url || '';
    const excludes = [
      '/api',
      '/uploads',
      '/api/docs',
      '/swagger',
      '/favicon.ico',
      '/robots.txt',
    ];
    if (excludes.some((p) => url === p || url.startsWith(p + '/'))) {
      return next();
    }
    if (url.startsWith('/api')) {
      return next();
    }

    req.url = '/api' + (url.startsWith('/') ? url : '/' + url);
    next();
  });

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

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests (e.g., server-to-server, curl)
      if (!origin) return callback(null, true);

      const normalized = normalizeOrigin(origin);

      // If no FRONTEND_URL configured, reflect origin (safe for local dev)
      if (allowedOrigins.length === 0) return callback(null, true);

      if (allowedOrigins.includes(normalized)) return callback(null, true);
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
