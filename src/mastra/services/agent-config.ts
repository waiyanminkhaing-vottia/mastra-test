import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { Agent, MastraLanguageModel, type ToolAction } from '@mastra/core';
import { Provider } from '@prisma/client';
import { ollama } from 'ollama-ai-provider-v2';

import { createChangeAwareCache } from '../lib/change-aware-cache';
import { logError, logger } from '../lib/logger';
import { sharedMemory } from '../lib/memory';
import { prisma } from '../lib/prisma';
import { toolsMap } from '../tools';

// ============================================================================
// Types & Interfaces
// ============================================================================

/**
 * Agent configuration interface
 * Supports hierarchical sub-agents (agents can have sub-agents)
 */
export interface AgentConfig {
  id: string;
  name: string;
  description: string | null;
  model: MastraLanguageModel;
  instruction: string;
  tools?: Record<string, ToolAction>;
  subAgents?: Record<string, AgentConfig>;
}

interface AgentListChangeInfo {
  agentsHash: string;
  lastUpdated: Date;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get tenant ID from environment variable
 */
function getTenantId(): string {
  const tenantId = process.env.TENANT_ID;
  if (!tenantId) {
    throw new Error('TENANT_ID environment variable is not set');
  }
  return tenantId;
}

/**
 * Create model instance based on provider
 */
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
      return openai('gpt-4o');
  }
};

/**
 * Simple hash function for change detection
 */
function createHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString();
}

/**
 * Get label ID with DEMO environment fallback
 */
async function resolveLabelId(
  agentLabelId: string | null
): Promise<string | null> {
  if (agentLabelId) {
    return agentLabelId;
  }

  if (process.env.DEMO && process.env.DEMO !== 'default') {
    const tenantId = getTenantId();
    const label = await prisma.promptLabel.findUnique({
      where: {
        name_tenantId: {
          name: process.env.DEMO,
          tenantId,
        },
      },
    });
    return label?.id ?? null;
  }

  return null;
}

/**
 * Get prompt version for agent
 */
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

/**
 * Get regular tools for a specific agent (from Tool/AgentTool models)
 */
async function getAgentTools(
  agentId: string
): Promise<Record<string, ToolAction>> {
  try {
    const agentTools = await prisma.agentTool.findMany({
      where: { agentId },
      include: {
        tool: true,
      },
    });

    if (agentTools.length === 0) {
      return {};
    }

    const tools: Record<string, ToolAction> = {};

    for (const agentTool of agentTools) {
      const toolName = agentTool.tool.name;
      // Get the actual tool implementation from the tools folder
      if (toolsMap[toolName as keyof typeof toolsMap]) {
        tools[toolName] = toolsMap[
          toolName as keyof typeof toolsMap
        ] as unknown as ToolAction;
      } else {
        logger.warn(`Tool ${toolName} not found in tools map`);
      }
    }

    return tools;
  } catch (error) {
    logError(
      `Failed to load tools for agent ${agentId}`,
      error instanceof Error ? error : new Error(String(error))
    );
    return {};
  }
}

/**
 * Get MCP tools for a specific agent
 */
async function getAgentMcpTools(
  agentId: string
): Promise<Record<string, ToolAction>> {
  try {
    const agentMcpTools = (await prisma.agentMcpTool.findMany({
      where: { agentId },
    })) as Array<{ mcpId: string; toolName: string }>;

    if (agentMcpTools.length === 0) {
      return {};
    }

    const { mcpManager } = await import('./mcp-config');

    const tools: Record<string, ToolAction> = {};
    const processedMcps = new Set<string>();

    for (const agentMcpTool of agentMcpTools) {
      if (!processedMcps.has(agentMcpTool.mcpId)) {
        const mcpTools = await mcpManager.getToolsByServerId(
          agentMcpTool.mcpId
        );

        const agentToolsFromThisMcp = agentMcpTools
          .filter((amt) => amt.mcpId === agentMcpTool.mcpId)
          .map((amt) => amt.toolName);

        for (const toolName of agentToolsFromThisMcp) {
          if (mcpTools[toolName]) {
            tools[toolName] = mcpTools[toolName] as unknown as ToolAction;
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

/**
 * Build agent config from database record
 */
async function buildAgentConfig(
  agent: {
    id: string;
    name: string;
    description: string | null;
    labelId: string | null;
    promptId: string;
    model: { provider: Provider; name: string };
  },
  includeSubAgents: boolean = false
): Promise<AgentConfig | null> {
  try {
    const labelId = await resolveLabelId(agent.labelId);
    const prompt = await getPromptVersion(agent.promptId, labelId);

    if (!prompt) {
      logger.warn(`No prompt version found for agent ${agent.name}`);
      return null;
    }

    // Load both regular tools and MCP tools
    const [regularTools, mcpTools] = await Promise.all([
      getAgentTools(agent.id),
      getAgentMcpTools(agent.id),
    ]);

    // Merge both tool sets (MCP tools take precedence if there's a name conflict)
    const tools = { ...regularTools, ...mcpTools };

    let subAgents: Record<string, AgentConfig> | undefined;
    if (includeSubAgents) {
      subAgents = await loadSubAgentsRecursive(agent.id);
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: createModelInstance(agent.model.provider, agent.model.name),
      instruction: prompt.content,
      tools,
      ...(subAgents && Object.keys(subAgents).length > 0 ? { subAgents } : {}),
    };
  } catch (error) {
    logger.error(
      `Failed to build config for agent ${agent.name}:`,
      error as Error
    );
    return null;
  }
}

// ============================================================================
// Sub-Agent Loading (Hierarchical)
// ============================================================================

/**
 * Load sub-agents recursively based on parentId
 * Schema: parentId/parent/subAgents relation named "AgentSubAgents"
 */
async function loadSubAgentsRecursive(
  parentId: string
): Promise<Record<string, AgentConfig>> {
  try {
    const tenantId = getTenantId();
    const subAgents = await prisma.agent.findMany({
      where: {
        parentId,
        tenantId,
      },
      include: {
        model: true,
        prompt: true,
        label: true,
      },
    });

    if (subAgents.length === 0) {
      return {};
    }

    return await buildSubAgentsConfig(subAgents);
  } catch (error) {
    logger.error(
      `Failed to load sub-agents for parent ${parentId}:`,
      error as Error
    );
    return {};
  }
}

/**
 * Build sub-agents config from database records (recursive)
 */
async function buildSubAgentsConfig(
  subAgentsData: Array<unknown>
): Promise<Record<string, AgentConfig>> {
  const result: Record<string, AgentConfig> = {};

  for (const agentData of subAgentsData) {
    const agent = agentData as {
      id: string;
      name: string;
      description: string | null;
      labelId: string | null;
      promptId: string;
      model: { provider: Provider; name: string };
    };

    const config = await buildAgentConfig(agent, false);
    if (config) {
      // Recursively load nested sub-agents
      const nestedSubAgents = await loadSubAgentsRecursive(agent.id);
      if (Object.keys(nestedSubAgents).length > 0) {
        config.subAgents = nestedSubAgents;
      }

      result[agent.name] = config;
    }
  }

  return result;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Get agent configuration by name
 * Recursively loads all sub-agents if requested
 */
export const getAgentConfig = async (
  agentName: string,
  includeSubAgents: boolean = true
): Promise<AgentConfig> => {
  try {
    const tenantId = getTenantId();
    const agent = await prisma.agent.findUniqueOrThrow({
      where: {
        name_tenantId: {
          name: agentName,
          tenantId,
        },
      },
      include: {
        model: true,
        prompt: true,
        label: true,
      },
    });

    const config = await buildAgentConfig(agent, includeSubAgents);

    if (!config) {
      throw new Error(`Failed to build config for agent ${agentName}`);
    }

    return config;
  } catch (error) {
    logError(
      `Failed to get agent config for ${agentName}`,
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
};

/**
 * Get all agents from database
 */
async function getAgentsFromDb(): Promise<AgentConfig[]> {
  try {
    const tenantId = getTenantId();
    const agents = await prisma.agent.findMany({
      where: {
        tenantId,
      },
      include: {
        model: true,
        prompt: true,
        label: true,
      },
    });

    const configs: AgentConfig[] = [];

    for (const agent of agents) {
      const config = await buildAgentConfig(agent, false);
      if (config) {
        configs.push(config);
      }
    }

    return configs;
  } catch (error) {
    logger.error('Failed to fetch agents from database:', error as Error);
    return [];
  }
}

// ============================================================================
// Change Detection
// ============================================================================

let lastKnownAgentListState: AgentListChangeInfo | null = null;

/**
 * Get current agent list change information
 * Tracks all agents for add/remove/update detection
 */
const getAgentListChangeInfo = async (): Promise<AgentListChangeInfo> => {
  const tenantId = getTenantId();
  const agents = await prisma.agent.findMany({
    where: {
      tenantId,
    },
    include: {
      model: true,
      prompt: true,
    },
    orderBy: { name: 'asc' },
  });

  // Track the most recent update timestamp across all data
  let mostRecentUpdate = new Date(0);

  const agentDetails = await Promise.all(
    agents.map(async (agent) => {
      // Track most recent timestamp
      if (agent.updatedAt > mostRecentUpdate) {
        mostRecentUpdate = agent.updatedAt;
      }
      if (agent.model.updatedAt > mostRecentUpdate) {
        mostRecentUpdate = agent.model.updatedAt;
      }
      if (agent.prompt.updatedAt > mostRecentUpdate) {
        mostRecentUpdate = agent.prompt.updatedAt;
      }

      // Get MCP tools
      const agentMcpTools = (await prisma.agentMcpTool.findMany({
        where: { agentId: agent.id },
      })) as Array<{ mcpId: string; toolName: string }>;

      const mcpToolsHash = createHash(
        agentMcpTools.map((amt) => `${amt.mcpId}:${amt.toolName}`).join('|')
      );

      // Get regular tools
      const agentTools = await prisma.agentTool.findMany({
        where: { agentId: agent.id },
        include: { tool: true },
      });

      const toolsHash = createHash(
        agentTools
          .map((at) => {
            if (at.tool.updatedAt > mostRecentUpdate) {
              mostRecentUpdate = at.tool.updatedAt;
            }
            if (at.createdAt > mostRecentUpdate) {
              mostRecentUpdate = at.createdAt;
            }
            return `${at.toolId}:${at.tool.updatedAt.getTime()}`;
          })
          .join('|')
      );

      return `${agent.id}:${agent.name}:${agent.updatedAt.getTime()}:${agent.model.updatedAt.getTime()}:${agent.prompt.updatedAt.getTime()}:${mcpToolsHash}:${toolsHash}`;
    })
  );

  return {
    agentsHash: createHash(agentDetails.join('||')),
    lastUpdated: mostRecentUpdate,
  };
};

/**
 * Check if any agent has changed
 * Detects changes to: list, agent config, model, prompt, MCP tools
 */
export const hasAgentListChanged = async (): Promise<boolean> => {
  try {
    const currentInfo = await getAgentListChangeInfo();

    if (!lastKnownAgentListState) {
      lastKnownAgentListState = currentInfo;
      logger.info('First time checking agents, treating as changed');
      return true;
    }

    const hasChanged =
      currentInfo.agentsHash !== lastKnownAgentListState.agentsHash;

    if (hasChanged) {
      logger.info('Agents config changed:', {
        currentHash: currentInfo.agentsHash,
        previousHash: lastKnownAgentListState.agentsHash,
        currentTimestamp: currentInfo.lastUpdated.toISOString(),
        previousTimestamp: lastKnownAgentListState.lastUpdated.toISOString(),
      });

      lastKnownAgentListState = currentInfo;
    } else {
      logger.debug('No agent changes detected', {
        hash: currentInfo.agentsHash,
        timestamp: currentInfo.lastUpdated.toISOString(),
      });
    }

    return hasChanged;
  } catch (error) {
    logger.error('Failed to check agent changes:', error as Error);
    return false;
  }
};

/**
 * Force refresh agent change detection
 */
export const refreshAgentListChangeDetection = async (): Promise<void> => {
  try {
    const currentInfo = await getAgentListChangeInfo();
    lastKnownAgentListState = currentInfo;
    logger.info('Refreshed agent change detection');
  } catch (error) {
    logger.error('Failed to refresh agent change detection:', error as Error);
  }
};

/**
 * Clear agent change detection cache
 */
export const clearAgentListChangeDetectionCache = (): void => {
  lastKnownAgentListState = null;
  logger.info('Cleared agent change detection cache');
};

// ============================================================================
// Change-Aware Cache
// ============================================================================

let onAgentListChangedCallback: (() => Promise<void>) | null = null;

const agentCache = createChangeAwareCache<AgentConfig[]>(
  async () => getAgentsFromDb(),
  {
    checkInterval: parseInt(process.env.SUB_AGENT_CACHE_TTL ?? '300', 10),
    dataCacheTtl: parseInt(process.env.SUB_AGENT_DATA_TTL ?? '86400', 10), // Safety net: force refresh after 24 hours
    changeDetector: async () => {
      const changed = await hasAgentListChanged();

      if (changed && onAgentListChangedCallback) {
        try {
          await onAgentListChangedCallback();
          logger.info('Notified agent info caches of list change');
        } catch (error) {
          logger.error('Failed to notify agent list change:', error as Error);
        }
      }

      return changed;
    },
    cacheName: 'AgentCache',
  }
);

/**
 * Register callback for agent list changes
 */
export function onAgentListChanged(callback: () => Promise<void>): void {
  onAgentListChangedCallback = callback;
}

// ============================================================================
// Agent Manager
// ============================================================================

/**
 * Create an Agent instance from config
 */
function createAgentInstance(config: AgentConfig): Agent {
  const baseConfig = {
    name: config.name,
    description: config.description ?? undefined,
    instructions: config.instruction,
    model: config.model,
    memory: sharedMemory,
  };

  if (config.tools && Object.keys(config.tools).length > 0) {
    return new Agent({
      ...baseConfig,
      tools: config.tools,
    });
  }

  return new Agent(baseConfig);
}

/**
 * Agent manager using change-aware-cache pattern
 * Manages all agents with automatic reload on changes
 */
class AgentManager {
  private agents = new Map<string, Agent>();
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('Agent manager already initialized');
      return;
    }

    logger.info('Initializing agent manager...');

    try {
      const configs = await agentCache.get('agents');
      await this.loadAgents(configs);

      this.isInitialized = true;
      logger.info(`Agent manager initialized with ${this.agents.size} agents`);
    } catch (error) {
      logger.error('Failed to initialize agent manager:', error as Error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  async getAgent(agentName: string): Promise<Agent | null> {
    if (this.agents.has(agentName)) {
      return this.agents.get(agentName) ?? null;
    }

    const configs = await agentCache.get('agents');
    const config = configs.find((c) => c.name === agentName);

    if (!config) {
      logger.warn(`Agent '${agentName}' not found`);
      return null;
    }

    const agent = createAgentInstance(config);
    this.agents.set(agentName, agent);

    return agent;
  }

  async getAllAgents(): Promise<Map<string, Agent>> {
    const configs = await agentCache.get('agents');

    for (const config of configs) {
      if (!this.agents.has(config.name)) {
        const agent = createAgentInstance(config);
        this.agents.set(config.name, agent);
      }
    }

    return new Map(this.agents);
  }

  async getAgentsRecord(): Promise<Record<string, Agent>> {
    const agentsMap = await this.getAllAgents();
    return Object.fromEntries(agentsMap);
  }

  async listAgentNames(): Promise<string[]> {
    const configs = await agentCache.get('agents');
    return configs.map((c) => c.name);
  }

  async listAgents(): Promise<AgentConfig[]> {
    return agentCache.get('agents');
  }

  async refresh(): Promise<void> {
    logger.info('Refreshing agent instances...');

    this.agents.clear();
    agentCache.invalidate('agents');

    if (this.isInitialized) {
      const configs = await agentCache.get('agents');
      await this.loadAgents(configs);
    }

    logger.info(`Agent manager refreshed with ${this.agents.size} agents`);
  }

  getCacheStats(): {
    agentCount: number;
    initialized: boolean;
    agentNames: string[];
  } {
    return {
      agentCount: this.agents.size,
      initialized: this.isInitialized,
      agentNames: Array.from(this.agents.keys()),
    };
  }

  private async loadAgents(configs: AgentConfig[]): Promise<void> {
    this.agents.clear();

    for (const config of configs) {
      try {
        const agent = createAgentInstance(config);
        this.agents.set(config.name, agent);
        logger.debug(`Loaded agent: ${config.name}`);
      } catch (error) {
        logger.error(`Failed to create agent ${config.name}:`, error as Error);
      }
    }

    logger.info(`Loaded ${configs.length} agents`);
  }
}

// ============================================================================
// Exports
// ============================================================================

export const agentManager = new AgentManager();

// Register automatic refresh on agent list changes
onAgentListChanged(async () => {
  await agentManager.refresh();
});
