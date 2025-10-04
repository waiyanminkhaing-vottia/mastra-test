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

const mainAgentName = process.env.MAIN_AGENT_NAME;

if (!mainAgentName) {
  throw new Error('MAIN_AGENT_NAME environment variable is not set');
}
const allAgents = await agentManager.getAll();
const mainAgent = Array.from(allAgents.values()).find(
  (agent) => agent.name === mainAgentName
);

if (!mainAgent) {
  throw new Error(`Main agent '${mainAgentName}' not found in agent cache`);
}

// Load only the main agent
const agentsRecord = { [mainAgent.name]: mainAgent };

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
