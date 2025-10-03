import { Agent, MastraLanguageModel, ToolAction } from '@mastra/core';

import { CacheManager, createHash } from '../lib/cache';
import { logger } from '../lib/logger';
import { sharedMemory } from '../lib/memory';
import { prisma } from '../lib/prisma';
import { getEnvInt, getTenantId } from '../lib/utils';
import { mcpClientManager } from './mcp-client-manager';
import { modelManager } from './model-manager';
import { toolManager } from './tool-manager';

// ============================================================================
// Types
// ============================================================================

interface AgentData {
  id: string;
  name: string;
  description: string | null;
  labelId: string | null;
  promptId: string;
  modelId: string;
}

type PerAgentCacheValue =
  | string
  | MastraLanguageModel
  | Record<string, ToolAction>
  | Record<string, Agent>;

// ============================================================================
// Per-Agent Cache - Caches agent components (instructions, models, tools)
// Note: Uses empty hash because component changes are tracked individually
// ============================================================================

const perAgentCache = new CacheManager<PerAgentCacheValue>({
  name: 'PerAgentCache',
  ttlSeconds: getEnvInt('AGENT_CACHE_TTL', 3600),
  checkPeriodSeconds: getEnvInt('AGENT_CACHE_CHECK_PERIOD', 600),
  loadData: async () => new Map(),
  getChangeHash: async () => '', // Empty: individual components use getWithHash
});

// ============================================================================
// Helper Functions - Prompt & Label Resolution
// ============================================================================

async function resolveLabelId(
  agentLabelId: string | null,
  tenantId: string
): Promise<string | null> {
  if (agentLabelId) {
    return agentLabelId;
  }

  const label = await prisma.promptLabel.findFirst({
    where: { tenantId },
  });

  return label?.id ?? null;
}

async function getPromptVersion(promptId: string, labelId: string | null) {
  if (labelId) {
    return prisma.promptVersion.findUniqueOrThrow({
      where: {
        promptId_labelId: {
          promptId,
          labelId,
        },
      },
    });
  }

  return prisma.promptVersion.findFirst({
    where: { promptId },
    orderBy: { version: 'desc' },
  });
}

// ============================================================================
// Helper Functions - Tools & Sub-Agents
// ============================================================================

async function getAgentToolIds(agentId: string): Promise<string[]> {
  const agentTools = await prisma.agentTool.findMany({
    where: { agentId },
    select: { toolId: true },
  });

  return agentTools.map((at) => at.toolId);
}

async function getSubAgentIds(parentId: string): Promise<string[]> {
  try {
    const tenantId = getTenantId();
    const subAgents = await prisma.agent.findMany({
      where: { parentId, tenantId },
      select: { id: true },
    });

    return subAgents.map((agent) => agent.id);
  } catch (error) {
    logger.error(
      `Failed to load sub-agent IDs for parent ${parentId}:`,
      error as Error
    );
    return [];
  }
}

// ============================================================================
// Agent Component Loaders
// ============================================================================

interface PromptData {
  content: string;
  hash: string;
}

async function loadPromptData(agentData: AgentData): Promise<PromptData> {
  const tenantId = getTenantId();
  const labelId = await resolveLabelId(agentData.labelId, tenantId);
  const prompt = await getPromptVersion(agentData.promptId, labelId);

  if (!prompt) {
    throw new Error(`No prompt version found for agent '${agentData.name}'`);
  }

  return {
    content: prompt.content,
    hash: createHash(
      `${agentData.promptId}:${labelId}:${prompt.updatedAt.getTime()}`
    ),
  };
}

async function loadInstructions(agentData: AgentData): Promise<string> {
  const promptData = await loadPromptData(agentData);
  return promptData.content;
}

async function getInstructionsHash(agentData: AgentData): Promise<string> {
  const promptData = await loadPromptData(agentData);
  return promptData.hash;
}

async function loadModel(modelId: string): Promise<MastraLanguageModel> {
  const model = await modelManager.get(modelId);
  if (!model) {
    throw new Error(`Model not found: ${modelId}`);
  }
  return model;
}

async function loadTools(agentId: string): Promise<Record<string, ToolAction>> {
  const tools: Record<string, ToolAction> = {};

  const toolIds = await getAgentToolIds(agentId);
  for (const toolId of toolIds) {
    const tool = await toolManager.get(toolId);
    if (tool) {
      tools[tool.id] = tool;
    } else {
      logger.warn(`Tool '${toolId}' not found for agent ${agentId}`);
    }
  }

  const mcpTools = await mcpClientManager.getAgentMcpTools(agentId);
  Object.assign(tools, mcpTools);

  return tools;
}

async function loadSubAgents(
  agentId: string,
  agentName: string
): Promise<Record<string, Agent>> {
  const subAgentIds = await getSubAgentIds(agentId);
  if (subAgentIds.length === 0) {
    return {};
  }

  const subAgents: Record<string, Agent> = {};
  const allAgents = await agentManager.getAll();

  for (const subAgentId of subAgentIds) {
    const subAgent = allAgents.get(subAgentId);
    if (subAgent) {
      subAgents[subAgent.name] = subAgent;
    } else {
      logger.warn(
        `Sub-agent '${subAgentId}' not found for agent '${agentName}'`
      );
    }
  }

  return subAgents;
}

// ============================================================================
// Agent Instance Creation
// ============================================================================

async function createAgentInstance(agentData: AgentData): Promise<Agent> {
  return new Agent({
    id: agentData.name,
    name: agentData.name,
    description: agentData.description ?? undefined,
    memory: sharedMemory,

    instructions: async () =>
      perAgentCache.getWithHash(
        `instructions:${agentData.id}`,
        async () => getInstructionsHash(agentData),
        async () => loadInstructions(agentData)
      ),

    model: async () =>
      perAgentCache.getWithHash(
        `model:${agentData.id}`,
        async () => createHash(agentData.modelId),
        async () => loadModel(agentData.modelId)
      ),

    tools: async () =>
      perAgentCache.getWithHash(
        `tools:${agentData.id}`,
        async () => {
          const toolIds = await getAgentToolIds(agentData.id);
          return createHash(toolIds.sort().join(','));
        },
        async () => loadTools(agentData.id)
      ),

    agents: async () =>
      perAgentCache.getWithHash(
        `agents:${agentData.id}`,
        async () => {
          const subAgentIds = await getSubAgentIds(agentData.id);
          return createHash(subAgentIds.sort().join(','));
        },
        async () => loadSubAgents(agentData.id, agentData.name)
      ),
  });
}

// ============================================================================
// Agent Manager - Manages all agents for the current tenant
// ============================================================================

const agentManager = new CacheManager<Agent>({
  name: 'AgentManager',
  ttlSeconds: getEnvInt('AGENT_CACHE_TTL', 3600),
  checkPeriodSeconds: getEnvInt('AGENT_CACHE_CHECK_PERIOD', 600),

  loadData: async () => {
    const tenantId = getTenantId();
    const agentsData = await prisma.agent.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        description: true,
        labelId: true,
        promptId: true,
        modelId: true,
        parentId: true,
      },
    });

    const agents = new Map<string, Agent>();

    for (const agentData of agentsData) {
      try {
        const agent = await createAgentInstance(agentData);
        agents.set(agentData.id, agent);
        logger.debug(`Loaded agent: '${agentData.name}'`);
      } catch (error) {
        logger.error(
          `Failed to create agent '${agentData.name}':`,
          error as Error
        );
      }
    }

    return agents;
  },

  getChangeHash: async () => {
    const tenantId = getTenantId();
    const agentsData = await prisma.agent.findMany({
      where: { tenantId },
      orderBy: { id: 'asc' },
      select: { id: true, name: true, description: true },
    });

    const agentList = agentsData
      .map((agent) => `${agent.id}:${agent.name}:${agent.description ?? ''}`)
      .join('||');

    return createHash(agentList);
  },
});

// ============================================================================
// Exports
// ============================================================================

export { agentManager, perAgentCache };
