import { Mastra } from '@mastra/core/mastra';

import { getMainAgentSync } from './agents/main-agent';
import { createHealthRoute } from './api/health';
import { logger } from './lib/logger';
import { sharedStorage, sharedVector } from './lib/memory';
import { initializeServices } from './lib/startup';

// Initialize services at startup
await initializeServices();

// Get base path from environment variable
const BASE_PATH = process.env.BASE_PATH ?? '';

export const mastra = new Mastra({
  logger,
  agents: { mainAgent: await getMainAgentSync() },
  storage: sharedStorage,
  vectors: {
    pgVector: sharedVector,
  },
  server: {
    apiRoutes: [createHealthRoute(BASE_PATH)],
  },
  telemetry: {
    serviceName: 'mastra-test',
    enabled: true,
    export: {
      type: 'console',
    },
  },
});
