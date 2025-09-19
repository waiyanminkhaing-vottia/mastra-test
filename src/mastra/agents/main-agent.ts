import { Agent } from '@mastra/core';

import { sharedMemory } from '../lib/memory';
import { zapierMcpClient } from '../mcp/zapier-client';
import { getAgentConfig } from '../services/agent-config';
import { getCurrentTime } from '../tools/getCurrentTime';

const agentName = 'main-agent';

const createMainAgent = async () => {
  const config = await getAgentConfig(agentName);

  // Get Zapier MCP tools for automation
  const zapierTools = await zapierMcpClient.getTools();

  return new Agent({
    id: agentName,
    name: agentName,
    description: config.description ?? undefined,
    instructions: async () => {
      const instructionConfig = await getAgentConfig(agentName);

      return instructionConfig.instruction.trim();
    },
    model: config.model,
    memory: sharedMemory,
    tools: {
      getCurrentTime,
      ...zapierTools,
    },
  });
};

export const mainAgent = await createMainAgent();
