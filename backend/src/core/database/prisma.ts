import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env';

export const prisma = new PrismaClient({
  log: isProd ? ['error', 'warn'] : ['error', 'warn', 'query'],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
