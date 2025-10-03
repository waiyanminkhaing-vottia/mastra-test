import type { ToolAction } from '@mastra/core';
import { MCPClient } from '@mastra/mcp';

import { CacheManager, createHash } from '../lib/cache';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getEnvInt } from '../lib/utils';

// ============================================================================
// Types
// ============================================================================

interface McpManagerData {
  client: MCPClient;
  serverNames: Map<string, string>; // mcpId -> serverName
}

// ============================================================================
// MCP Client Cache - Manages single MCPClient instance for all servers
// ============================================================================

class McpClientCache {
  private readonly cache: CacheManager<McpManagerData>;
  private data: McpManagerData | null = null;

  constructor() {
    const ttlSeconds = getEnvInt('MCP_CACHE_TTL', 3600);
    const checkPeriodSeconds = getEnvInt('MCP_CACHE_CHECK_PERIOD', 600);

    this.cache = new CacheManager<McpManagerData>({
      name: 'McpClientManager',
      ttlSeconds,
      checkPeriodSeconds,
      loadData: this.loadData.bind(this),
      getChangeHash: this.getChangeHash.bind(this),
    });
  }

  private async loadData(): Promise<Map<string, McpManagerData>> {
    const mcpConfigs = await prisma.mcp.findMany();

    const servers: Record<string, { url: URL }> = {};
    const serverNames = new Map<string, string>();

    for (const config of mcpConfigs) {
      try {
        servers[config.name] = { url: new URL(config.url) };
        serverNames.set(config.id, config.name);
      } catch (error) {
        logger.error(
          `Invalid MCP URL for server '${config.name}': ${config.url}`,
          error as Error
        );
        // Skip invalid server configuration
      }
    }

    const client = new MCPClient({ servers });

    const serverList = Object.keys(servers).join(', ');
    logger.info(
      `MCP Client initialized with ${Object.keys(servers).length} server(s)${
        serverList ? `: ${serverList}` : ''
      }`
    );

    this.data = { client, serverNames };

    return new Map();
  }

  private async getChangeHash(): Promise<string> {
    const mcpConfigs = await prisma.mcp.findMany({
      orderBy: { id: 'asc' },
    });

    const configString = mcpConfigs
      .map(
        (mcp) => `${mcp.id}:${mcp.name}:${mcp.url}:${mcp.updatedAt.getTime()}`
      )
      .join('||');

    return createHash(configString);
  }

  async initialize(): Promise<void> {
    await this.cache.initialize();
  }

  async get(): Promise<McpManagerData | null> {
    await this.cache.getAll();
    return this.data;
  }

  isReady(): boolean {
    return this.cache.isReady();
  }

  shutdown(): void {
    this.cache.shutdown();
  }
}

// ============================================================================
// MCP Client Manager - Public API
// ============================================================================

class McpClientManager {
  private readonly cache = new McpClientCache();

  async initialize(): Promise<void> {
    await this.cache.initialize();
  }

  async getMcpClient(): Promise<MCPClient | null> {
    const data = await this.cache.get();
    return data?.client ?? null;
  }

  async getMcpTool(
    mcpId: string,
    toolName: string
  ): Promise<ToolAction | null> {
    const data = await this.cache.get();
    if (!data) return null;

    const serverName = data.serverNames.get(mcpId);
    if (!serverName) {
      logger.warn(`Server not found for MCP ID: ${mcpId}`);
      return null;
    }

    try {
      const toolsets = await data.client.getToolsets();
      return (toolsets[serverName]?.[toolName] as ToolAction) ?? null;
    } catch (error) {
      logger.error(
        `Failed to get toolsets from MCP client for server '${serverName}':`,
        error as Error
      );
      return null;
    }
  }

  async getMcpTools(mcpId: string): Promise<Map<string, ToolAction>> {
    const data = await this.cache.get();
    if (!data) return new Map();

    const serverName = data.serverNames.get(mcpId);
    if (!serverName) {
      logger.warn(`Server not found for MCP ID: ${mcpId}`);
      return new Map();
    }

    try {
      const toolsets = await data.client.getToolsets();
      const serverTools = toolsets[serverName] ?? {};
      const tools = new Map<string, ToolAction>();

      for (const [toolName, tool] of Object.entries(serverTools)) {
        tools.set(toolName, tool as ToolAction);
      }

      return tools;
    } catch (error) {
      logger.error(
        `Failed to get toolsets from MCP client for server '${serverName}':`,
        error as Error
      );
      return new Map();
    }
  }

  async getServerName(mcpId: string): Promise<string | null> {
    const data = await this.cache.get();
    return data?.serverNames.get(mcpId) ?? null;
  }

  async getAgentMcpTools(agentId: string): Promise<Record<string, ToolAction>> {
    const data = await this.cache.get();
    if (!data) return {};

    const agentMcpTools = await prisma.agentMcpTool.findMany({
      where: { agentId },
      select: { mcpId: true, toolName: true },
    });

    if (agentMcpTools.length === 0) return {};

    try {
      const toolsets = await data.client.getToolsets();
      const tools: Record<string, ToolAction> = {};

      for (const { mcpId, toolName } of agentMcpTools) {
        const serverName = data.serverNames.get(mcpId);
        if (!serverName) {
          logger.warn(`Server not found for MCP ID: ${mcpId}`);
          continue;
        }

        const tool = toolsets[serverName]?.[toolName] as ToolAction | undefined;
        if (tool) {
          tools[`${mcpId}:${toolName}`] = tool;
        } else {
          logger.warn(
            `Tool '${toolName}' not found on server '${serverName}' (MCP ${mcpId}) for agent ${agentId}`
          );
        }
      }

      return tools;
    } catch (error) {
      logger.error(
        `Failed to get toolsets from MCP client for agent ${agentId}:`,
        error as Error
      );
      return {};
    }
  }

  isReady(): boolean {
    return this.cache.isReady();
  }

  async shutdown(): Promise<void> {
    const data = await this.cache.get();
    if (data?.client) {
      try {
        await data.client.disconnect();
        logger.info('MCP Client disconnected');
      } catch (error) {
        logger.error('Failed to disconnect MCP client:', error as Error);
      }
    }
    this.cache.shutdown();
  }
}

// ============================================================================
// Exports
// ============================================================================

export const mcpClientManager = new McpClientManager();
