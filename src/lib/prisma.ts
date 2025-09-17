import { PrismaClient } from '@prisma/client';

import { mastra } from '../mastra';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create Prisma client with Pino logging
const prismaWithLogging = new PrismaClient({
  log: [
    {
      emit: 'event',
      level: 'query',
    },
    {
      emit: 'event',
      level: 'error',
    },
    {
      emit: 'event',
      level: 'info',
    },
    {
      emit: 'event',
      level: 'warn',
    },
  ],
});

/**
 * Global Prisma client instance with logging configuration
 * Uses singleton pattern to prevent multiple instances in development
 */
export const prisma = globalForPrisma.prisma ?? prismaWithLogging;

// Set up Mastra logging for Prisma events
if (!globalForPrisma.prisma) {
  const logger = mastra.getLogger();

  prismaWithLogging.$on(
    'query',
    (e: {
      query: string;
      params: string;
      duration: number;
      target: string;
    }) => {
      logger.debug(`Prisma query: ${e.query} [${e.duration}ms]`, {
        query: e.query,
        params: e.params,
        duration: e.duration,
        target: e.target,
      });
    }
  );

  prismaWithLogging.$on('error', (e: { target: string; timestamp: Date }) => {
    logger.error(`Prisma error on ${e.target}`, {
      target: e.target,
      timestamp: e.timestamp,
    });
  });

  prismaWithLogging.$on(
    'info',
    (e: { message: string; target: string; timestamp: Date }) => {
      logger.info(`Prisma info: ${e.message}`, {
        target: e.target,
        timestamp: e.timestamp,
      });
    }
  );

  prismaWithLogging.$on(
    'warn',
    (e: { message: string; target: string; timestamp: Date }) => {
      logger.warn(`Prisma warning: ${e.message}`, {
        target: e.target,
        timestamp: e.timestamp,
      });
    }
  );
}

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
