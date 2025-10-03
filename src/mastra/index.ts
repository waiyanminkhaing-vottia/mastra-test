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
// Main Agent Setup
// ============================================================================

const mainAgentName = process.env.MAIN_AGENT_NAME ?? 'main-agent';
const allAgents = await agentManager.getAll();
const mainAgent = Array.from(allAgents.values()).find(
  (agent) => agent.name === mainAgentName
);

if (!mainAgent) {
  throw new Error(`Main agent '${mainAgentName}' not found in agent cache`);
}

// Convert all agents to a record for registration
const agentsRecord = Object.fromEntries(
  Array.from(allAgents.values()).map((agent) => [agent.name, agent])
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
