import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as bodyParser from 'body-parser';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe, Logger } from '@nestjs/common';
import helmet from 'helmet';
import * as compression from 'compression';
import * as winston from 'winston';
import timeout = require('express-timeout-handler');

async function bootstrap() {
  // Configure Winston logger
  const winstonLogger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ),
    defaultMeta: { service: 'resto-management-backend' },
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple(),
        ),
      }),
      // In production, add file transport
      ...(process.env.NODE_ENV === 'production'
        ? [
            new winston.transports.File({
              filename: 'logs/error.log',
              level: 'error',
            }),
            new winston.transports.File({
              filename: 'logs/combined.log',
            }),
          ]
        : []),
    ],
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: winstonLogger,
  });

  // Trust proxy for accurate IP addresses behind load balancers
  app.set('trust proxy', 1);

  // Security: Helmet for HTTP headers
  app.use(helmet());

  // Compression: Enable gzip compression
  app.use(compression());

  // Timeout: Set request timeout (30 seconds)
  app.use(
    timeout.handler({
      timeout: 30000, // 30 seconds
      onTimeout: (req: any, res: any) => {
        winstonLogger.warn(`Request timeout: ${req.method} ${req.url}`);
        res.status(408).json({
          statusCode: 408,
          message: 'Request timeout',
          error: 'Request Timeout',
        });
      },
    }),
  );

  // HTTPS: Force HTTPS in production
  if (process.env.NODE_ENV === 'production') {
    app.use((req: any, res: any, next: any) => {
      if (req.header('x-forwarded-proto') !== 'https') {
        res.redirect(`https://${req.header('host')}${req.url}`);
      } else {
        next();
      }
    });
  }

  // Validation: Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove properties not in DTO
      forbidNonWhitelisted: true, // Throw error if non-whitelisted properties
      transform: true, // Transform payloads to DTO instances
    }),
  );

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

  const corsOriginsRaw = (
    process.env.CORS_ORIGINS ??
    process.env.FRONTEND_URL ??
    ''
  ).trim();
  const allowedOrigins = corsOriginsRaw
    ? corsOriginsRaw
        .split(',')
        .map((s) => normalizeOrigin(s))
        .filter(Boolean)
    : [];

  const isAllowedOrigin = (origin: string): boolean => {
    const normalized = normalizeOrigin(origin).toLowerCase();
    if (!normalized) return false;

    // Si la allowlist es solo de localhost (config típica de dev), no bloquear otras origins.
    const isLocalDevList =
      allowedOrigins.length > 0 &&
      allowedOrigins.every((raw) => {
        const entry = normalizeOrigin(raw).toLowerCase();
        return (
          /^https?:\/\/localhost(?::\d+)?$/.test(entry) ||
          /^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(entry)
        );
      });
    if (isLocalDevList) return true;

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

      // If no CORS_ORIGINS/FRONTEND_URL configured, reflect origin (safe for local dev)
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

  // Swagger documentation (only in development)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Resto Management API')
      .setDescription('The Resto Management API description')
      .setVersion('1.0')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(process.env.PORT ?? 4000);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    winstonLogger.info('SIGTERM received, shutting down gracefully');
    await app.close();
  });

  process.on('SIGINT', async () => {
    winstonLogger.info('SIGINT received, shutting down gracefully');
    await app.close();
  });
}
bootstrap().catch((err) => console.error('Error starting server:', err));
