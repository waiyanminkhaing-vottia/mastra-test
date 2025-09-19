import { Mastra } from '@mastra/core/mastra';

import { mainAgent } from './agents/main-agent';
import { logger } from './lib/logger';
import { sharedStorage, sharedVector } from './lib/memory';

export const mastra = new Mastra({
  logger,
  agents: {
    mainAgent,
  },
  storage: sharedStorage,
  vectors: {
    pgVector: sharedVector,
  },
});
