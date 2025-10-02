import { MCPClient } from '@mastra/mcp';

import { createChangeAwareCache } from '../lib/change-aware-cache';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { hasMcpServersChanged } from './mcp-change-detector';

export interface McpServer {
  id: string;
  name: string;
  url: string;
}

// Create change-aware MCP servers cache
const mcpServersCache = createChangeAwareCache<McpServer[]>(
  async () => getMcpServersFromDb(),
  {
    checkInterval: parseInt(process.env.MCP_CACHE_TTL ?? '300', 10), // Check for changes every 5 minutes
    dataCacheTtl: parseInt(process.env.MCP_DATA_TTL ?? '86400', 10), // Safety net: force refresh after 24 hours
    changeDetector: hasMcpServersChanged,
    cacheName: 'McpServersCache',
  }
);

/**
 * Get MCP servers from database
 */
async function getMcpServersFromDb(): Promise<McpServer[]> {
  try {
    return await prisma.mcp.findMany({
      select: {
        id: true,
        name: true,
        url: true,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch MCP servers from database:', error as Error);
    return [];
  }
}

/**
 * MCP manager using change-aware-cache pattern
 */
class McpManager {
  private clients = new Map<string, MCPClient>();
  private toolsCache = new Map<string, Record<string, unknown>>();
  private isInitialized = false;

  /**
   * Initialize the MCP manager at app startup
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.debug('MCP manager already initialized');
      return;
    }

    logger.info('Initializing MCP manager at startup...');

    try {
      // Load MCP servers (this will populate the cache)
      const servers = await mcpServersCache.get('mcp-servers');
      await this.loadMcpClients(servers);

      this.isInitialized = true;
      logger.info(`MCP manager initialized with ${this.clients.size} servers`);
    } catch (error) {
      logger.error('Failed to initialize MCP manager:', error as Error);
      throw error;
    }
  }

  /**
   * Check if the manager is ready for use
   */
  isReady(): boolean {
    return this.isInitialized;
  }

  /**
   * Get a combined MCP client with all servers
   */
  async getClient(): Promise<MCPClient | null> {
    const mcpServers = await mcpServersCache.get('mcp-servers');
    if (mcpServers.length === 0) {
      return null;
    }

    const servers: Record<string, { url: URL }> = {};
    mcpServers.forEach((mcp) => {
      servers[mcp.name] = { url: new URL(mcp.url) };
    });

    return new MCPClient({
      id: 'dynamic-mcp-client',
      servers,
    });
  }

  /**
   * Get MCP client for a specific server
   */
  async getClientById(mcpId: string): Promise<MCPClient | null> {
    if (this.clients.has(mcpId)) {
      return this.clients.get(mcpId) ?? null;
    }

    const mcpServers = await mcpServersCache.get('mcp-servers');
    const mcpServer = mcpServers.find((s) => s.id === mcpId);

    if (!mcpServer) {
      return null;
    }

    try {
      const client = new MCPClient({
        id: `mcp-client-${mcpServer.id}`,
        servers: {
          [mcpServer.name]: {
            url: new URL(mcpServer.url),
          },
        },
      });

      this.clients.set(mcpId, client);
      return client;
    } catch (error) {
      logger.error(
        `Failed to create MCP client for ${mcpServer.name}:`,
        error as Error
      );
      return null;
    }
  }

  /**
   * Get tools for a specific MCP server
   */
  async getToolsByServerId(mcpId: string): Promise<Record<string, unknown>> {
    let tools = this.toolsCache.get(mcpId);

    if (!tools) {
      const client = await this.getClientById(mcpId);
      if (!client) {
        return {};
      }

      try {
        tools = await client.getTools();
        this.toolsCache.set(mcpId, tools);
      } catch (error) {
        logger.error(
          `Failed to load tools for MCP server ${mcpId}:`,
          error as Error
        );
        tools = {};
      }
    }

    return tools;
  }

  /**
   * Get all MCP tools (shared across agents)
   */
  async getAllTools(): Promise<Record<string, unknown>> {
    const client = await this.getClient();
    if (!client) {
      return {};
    }

    const cacheKey = 'all-tools';
    let tools = this.toolsCache.get(cacheKey);

    if (!tools) {
      try {
        tools = await client.getTools();
        this.toolsCache.set(cacheKey, tools);
      } catch (error) {
        logger.error('Failed to load all MCP tools:', error as Error);
        tools = {};
      }
    }

    return tools;
  }

  /**
   * List all MCP servers (cached)
   */
  async listMcpServers(): Promise<McpServer[]> {
    return mcpServersCache.get('mcp-servers');
  }

  /**
   * Clear all caches and force refresh
   */
  async refresh(): Promise<void> {
    this.clients.clear();
    this.toolsCache.clear();

    // Force refresh the change-aware cache
    mcpServersCache.invalidate('mcp-servers');

    if (this.isInitialized) {
      const servers = await mcpServersCache.get('mcp-servers');
      await this.loadMcpClients(servers);
    }

    logger.info('MCP manager refreshed');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    serverCount: number;
    initialized: boolean;
    toolsCacheSize: number;
  } {
    return {
      serverCount: this.clients.size,
      initialized: this.isInitialized,
      toolsCacheSize: this.toolsCache.size,
    };
  }

  /**
   * Load MCP clients from server list
   */
  private async loadMcpClients(servers: McpServer[]): Promise<void> {
    this.clients.clear();

    for (const mcpServer of servers) {
      try {
        const client = new MCPClient({
          id: `mcp-client-${mcpServer.id}`,
          servers: {
            [mcpServer.name]: {
              url: new URL(mcpServer.url),
            },
          },
        });

        this.clients.set(mcpServer.id, client);
        logger.debug(`Loaded MCP server: ${mcpServer.name} (${mcpServer.url})`);
      } catch (error) {
        logger.error(
          `Failed to create MCP client for ${mcpServer.name}:`,
          error as Error
        );
      }
    }

    logger.info(`Loaded ${servers.length} MCP servers`);
  }
}

// Export singleton instance
export const mcpManager = new McpManager();

// Legacy exports for backward compatibility
export const dynamicMcpClient = mcpManager;
export const mcpCacheManager = mcpManager;
