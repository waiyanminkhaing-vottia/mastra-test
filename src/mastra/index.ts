import { Mastra } from '@mastra/core/mastra';

import { getMainAgent } from './agents/main-agent';
import { logger } from './lib/logger';
import { sharedStorage, sharedVector } from './lib/memory';

let _mastra: Mastra | null = null;

export const getMastra = async (): Promise<Mastra> => {
  if (!_mastra) {
    const mainAgent = await getMainAgent();

    _mastra = new Mastra({
      logger,
      agents: {
        mainAgent,
      },
      storage: sharedStorage,
      vectors: {
        pgVector: sharedVector,
      },
    });
  }
  return _mastra;
};
