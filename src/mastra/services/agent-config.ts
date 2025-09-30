import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { MastraLanguageModel } from '@mastra/core';
import { Provider } from '@prisma/client';
import { ollama } from 'ollama-ai-provider-v2';

import { logError } from '../lib/logger';
import { prisma } from '../lib/prisma';

const createModelInstance = (
  provider: Provider,
  modelName: string
): MastraLanguageModel => {
  switch (provider) {
    case Provider.OPENAI:
      return openai(modelName);
    case Provider.ANTHROPIC:
      return anthropic(modelName);
    case Provider.GOOGLE:
      return google(modelName);
    case Provider.OLLAMA:
      return ollama(modelName);
    default:
      return openai('gpt-4o'); // fallback
  }
};

export interface AgentConfig {
  id: string;
  name: string;
  description: string | null;
  model: MastraLanguageModel;
  instruction: string;
  tools?: Record<string, unknown>;
}

export const getAgentConfig = async (
  agentName: string
): Promise<AgentConfig> => {
  try {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { name: agentName },
      include: {
        model: true,
        prompt: true,
        label: true,
      },
    });

    let labelId = agent.labelId;

    // If agent has no labelId, check DEMO environment variable
    if (!agent.labelId && process.env.DEMO && process.env.DEMO !== 'default') {
      const label = await prisma.promptLabel.findUnique({
        where: { name: process.env.DEMO },
      });
      labelId = label?.id ?? null;
    }

    let prompt;
    if (labelId) {
      prompt = await prisma.promptVersion.findUniqueOrThrow({
        where: {
          promptId_labelId: {
            promptId: agent.promptId,
            labelId,
          },
        },
      });
    } else {
      prompt = await prisma.promptVersion.findFirst({
        where: { promptId: agent.promptId },
        orderBy: {
          version: 'desc',
        },
      });
    }

    if (!prompt) {
      throw new Error(`No prompt version found for agent ${agentName}`);
    }

    // Get MCP tools for this agent (cached with agent config)
    const tools = await getAgentMcpTools(agent.id);

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: createModelInstance(agent.model.provider, agent.model.name),
      instruction: prompt.content,
      tools,
    };
  } catch (error) {
    logError(
      `Failed to get agent config for ${agentName}`,
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
};

/**
 * Get MCP tools for a specific agent
 * This function is called as part of agent config loading and will be cached with the agent config
 */
async function getAgentMcpTools(
  agentId: string
): Promise<Record<string, unknown>> {
  try {
    // Get agent's MCP tool assignments
    const agentMcpTools = (await prisma.agentMcpTool.findMany({
      where: { agentId },
    })) as Array<{ mcpId: string; toolName: string }>;

    if (agentMcpTools.length === 0) {
      return {};
    }

    // Import mcpManager here to avoid circular dependency
    const { mcpManager } = await import('./mcp-config');

    const tools: Record<string, unknown> = {};
    const processedMcps = new Set<string>();

    // Load tools from each assigned MCP server
    for (const agentMcpTool of agentMcpTools) {
      // Only fetch tools from each MCP server once
      if (!processedMcps.has(agentMcpTool.mcpId)) {
        const mcpTools = await mcpManager.getToolsByServerId(
          agentMcpTool.mcpId
        );

        // Get all tools from this MCP server that are assigned to this agent
        const agentToolsFromThisMcp = agentMcpTools
          .filter((amt) => amt.mcpId === agentMcpTool.mcpId)
          .map((amt) => amt.toolName);

        // Include only the specific tools assigned to this agent
        for (const toolName of agentToolsFromThisMcp) {
          if (mcpTools[toolName]) {
            tools[toolName] = mcpTools[toolName];
          }
        }

        processedMcps.add(agentMcpTool.mcpId);
      }
    }

    return tools;
  } catch (error) {
    logError(
      `Failed to load MCP tools for agent ${agentId}`,
      error instanceof Error ? error : new Error(String(error))
    );
    return {};
  }
}
