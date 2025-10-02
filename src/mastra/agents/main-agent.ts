import { Agent } from '@mastra/core';

import { createChangeAwareCache } from '../lib/change-aware-cache';
import { logger } from '../lib/logger';
import { sharedMemory } from '../lib/memory';
import {
  type AgentConfig,
  getAgentConfig,
  hasAgentListChanged,
} from '../services/agent-config';

const agentName = process.env.MAIN_AGENT_NAME ?? 'main-agent';

// Create change-aware agent config cache
const agentConfigCache = createChangeAwareCache<AgentConfig>(
  async (name: string) => getAgentConfig(name),
  {
    checkInterval: parseInt(process.env.AGENT_CONFIG_CACHE_TTL ?? '10', 10), // Check for changes every 10 seconds
    dataCacheTtl: parseInt(process.env.AGENT_CONFIG_DATA_TTL ?? '86400', 10), // Safety net: force refresh after 24 hours
    changeDetector: async () =>
      // Use unified agent change detection for ALL agents
      hasAgentListChanged(),
    cacheName: `AgentConfigCache:${agentName}`,
  }
);

const createMainAgent = async () => {
  try {
    const config = await agentConfigCache.get(agentName);

    return new Agent({
      name: config.name,
      description: config.description ?? undefined,
      instructions: async () => {
        const latestConfig = await agentConfigCache.get(agentName);
        return latestConfig.instruction;
      },
      model: async () => {
        const latestConfig = await agentConfigCache.get(agentName);
        return latestConfig.model;
      },
      memory: sharedMemory,
      tools: async () => {
        const latestConfig = await agentConfigCache.get(agentName);
        return latestConfig.tools ?? {};
      },
    });
  } catch (error) {
    logger.error(`Failed to create main agent '${agentName}':`, {
      error: error instanceof Error ? error.message : error,
      agentName,
    });
    throw error;
  }
};

let _mainAgent: Agent | null = null;
let _mainAgentPromise: Promise<Agent> | null = null;

export const getMainAgent = async (): Promise<Agent> => {
  if (!_mainAgent) {
    _mainAgentPromise ??= createMainAgent();
    _mainAgent = await _mainAgentPromise;
  }
  return _mainAgent;
};

// For Mastra constructor - returns the same cached instance
export const getMainAgentSync = () => {
  _mainAgentPromise ??= createMainAgent();
  return _mainAgentPromise;
};
