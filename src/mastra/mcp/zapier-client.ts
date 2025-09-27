import { MCPClient } from '@mastra/mcp';

import { logger } from '../lib/logger';

const zapierMcpUrl = process.env.ZAPIER_MCP_URL;
if (!zapierMcpUrl) {
  throw new Error('ZAPIER_MCP_URL environment variable is required');
}

export const zapierMcpClient = new MCPClient({
  id: 'mcp-client',
  servers: {
    zapier: {
      url: new URL(zapierMcpUrl),
    },
  },
});

// Cache MCP tools to avoid reloading
let _zapierTools: Record<string, unknown> | null = null;

export const getZapierTools = async (): Promise<Record<string, unknown>> => {
  if (!_zapierTools) {
    try {
      _zapierTools = await zapierMcpClient.getTools();
    } catch (error) {
      logger.error('Failed to load Zapier tools:', error as Error);
      _zapierTools = {};
    }
  }
  return _zapierTools;
};

/**
 * Clear MCP tools cache (useful for testing or forced refresh)
 */
export const clearMcpToolsCache = (): void => {
  _zapierTools = null;
  logger.info('Cleared MCP tools cache');
};
