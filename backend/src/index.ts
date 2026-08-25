import { env } from './core/config/env';
import { logger } from './core/logger/logger';
import { connectDatabase, disconnectDatabase } from './core/database/prisma';
import { connectRedis, disconnectRedis } from './core/cache/redis';
import { verifyMailConfig } from './core/mail/mailer';

async function bootstrap(): Promise<void> {
  await connectDatabase();
  logger.info('Database connected');
  await connectRedis();

  // Import after Redis status is known so rate-limiter picks the right store.
  const { createServer } = await import('./core/server');
  const app = createServer();
  const server = app.listen(env.PORT, () => {
    logger.info(`🚀 ${env.APP_NAME} listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  // Surfaces a bad API key / SMTP password in the logs at boot instead of
  // silently losing notification emails for weeks.
  void verifyMailConfig();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');
    server.close();
    await disconnectDatabase();
    await disconnectRedis();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error({ err }, 'Fatal error during bootstrap');
  process.exit(1);
});
