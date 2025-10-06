import { Mastra } from '@mastra/core/mastra';

import { healthRoute } from './api/health';
import { logger } from './lib/logger';
import { sharedStorage, sharedVector } from './lib/memory';
import { initializeServices } from './lib/startup';
import { agentManager } from './services/agent-manager';

// ============================================================================
// Service Initialization
// ============================================================================

await initializeServices();

// ============================================================================
// Load All Agents
// ============================================================================

const allAgents = await agentManager.getAll();

// Convert Map to Record for Mastra
const agentsRecord = Object.fromEntries(
  Array.from(allAgents.values()).map((agent) => [agent.name, agent])
);

logger.info(
  `Loaded ${allAgents.size} agents: ${Array.from(allAgents.values())
    .map((a) => a.name)
    .join(', ')}`
);

// ============================================================================
// Mastra Configuration
// ============================================================================

export const mastra = new Mastra({
  logger,
  agents: agentsRecord,
  storage: sharedStorage,
  vectors: { pgVector: sharedVector },
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
