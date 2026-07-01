import express, { type Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApiDocument } from './openapi/registry';
import { env, corsOrigins } from './config/env';
import { logger } from './logger/logger';
import { requestId } from './middlewares/requestId.middleware';
import { globalRateLimiter } from './middlewares/rateLimit.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { apiRouter } from '../routes';

export function createServer(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(requestId);
  app.use(helmet());
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(
    pinoHttp({
      logger,
      genReqId: (req) => (req as { id?: string }).id ?? '',
      autoLogging: { ignore: (req) => req.url === `${env.API_PREFIX}/health` },
    }),
  );

  // API docs (Swagger UI) — public, generated from Zod schemas. Mount before rate limiter.
  const openApiDoc = buildOpenApiDocument();
  app.get(`${env.API_PREFIX}/docs.json`, (_req, res) => res.json(openApiDoc));
  app.use(
    `${env.API_PREFIX}/docs`,
    // Helmet's CSP blocks Swagger UI's inline assets; relax for this route only.
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(openApiDoc, { customSiteTitle: 'Kratos CRM API Docs' }),
  );

  app.use(globalRateLimiter);

  app.use(env.API_PREFIX, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
