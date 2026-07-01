import pino from 'pino';
import { env, isProd } from '../config/env';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  base: { app: env.APP_NAME },
  transport: isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 }, // stdout (avoids extra dep on pino-pretty)
      },
  timestamp: pino.stdTimeFunctions.isoTime,
});
