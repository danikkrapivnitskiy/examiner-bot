import { PrismaClient } from '@prisma/client';

export function createPrismaClient(nodeEnv: string): PrismaClient {
  return new PrismaClient({
    log: nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
  });
}
