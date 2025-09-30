import { Mastra } from '@mastra/core/mastra';

import { getMainAgentSync } from './agents/main-agent';
import { healthRoute } from './api/health';
import { logger } from './lib/logger';
import { sharedStorage, sharedVector } from './lib/memory';
import { initializeServices } from './lib/startup';

// Initialize services at startup
await initializeServices();

export const mastra = new Mastra({
  logger,
  agents: { mainAgent: await getMainAgentSync() },
  storage: sharedStorage,
  vectors: {
    pgVector: sharedVector,
  },
  server: {
    apiRoutes: [healthRoute],
  },
  telemetry: {
    serviceName: 'mastra-test',
    enabled: true,
    export: {
      type: 'console',
    },
  },
});
