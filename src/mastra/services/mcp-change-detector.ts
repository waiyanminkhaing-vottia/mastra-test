import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

interface McpChangeInfo {
  mcpServersHash: string;
  lastUpdated: Date;
}

// In-memory store for last known MCP state
let lastKnownMcpState: McpChangeInfo | null = null;

/**
 * Check if MCP servers configuration has changed since last check
 * This is used by change-aware-cache for MCP client caching
 * @returns Promise<boolean> - True if MCP config has changed
 */
export const hasMcpServersChanged = async (): Promise<boolean> => {
  try {
    // Get current MCP servers from database
    const currentInfo = await getMcpChangeInfo();

    // If no previous record, consider it changed (first time)
    if (!lastKnownMcpState) {
      lastKnownMcpState = currentInfo;
      logger.info('First time checking MCP servers, treating as changed');
      return true;
    }

    // Check if MCP servers hash has changed
    const hasChanged =
      currentInfo.mcpServersHash !== lastKnownMcpState.mcpServersHash ||
      currentInfo.lastUpdated.getTime() !==
        lastKnownMcpState.lastUpdated.getTime();

    if (hasChanged) {
      logger.info('MCP servers config changed:', {
        serversChanged:
          currentInfo.mcpServersHash !== lastKnownMcpState.mcpServersHash,
        timestampChanged:
          currentInfo.lastUpdated.getTime() !==
          lastKnownMcpState.lastUpdated.getTime(),
        currentHash: currentInfo.mcpServersHash,
        previousHash: lastKnownMcpState.mcpServersHash,
        currentTimestamp: currentInfo.lastUpdated,
        previousTimestamp: lastKnownMcpState.lastUpdated,
      });

      // Update our cache with new info
      lastKnownMcpState = currentInfo;
    } else {
      logger.debug('No MCP servers changes detected');
    }

    return hasChanged;
  } catch (error) {
    logger.error('Failed to check MCP servers changes:', error as Error);
    return false; // Assume no change on error to avoid unnecessary fetches
  }
};

/**
 * Get current MCP change information
 */
const getMcpChangeInfo = async (): Promise<McpChangeInfo> => {
  const mcpServers = await prisma.mcp.findMany({
    select: { id: true, name: true, url: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
  });

  // Create hash from MCP servers data for change detection
  const mcpServersHash = createHash(
    mcpServers
      .map((s) => `${s.id}:${s.name}:${s.url}:${s.updatedAt.getTime()}`)
      .join('|')
  );

  const firstServer = mcpServers[0];
  const latestUpdate = firstServer ? firstServer.updatedAt : new Date(0);

  return {
    mcpServersHash,
    lastUpdated: latestUpdate,
  };
};

/**
 * Simple hash function for strings
 */
function createHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

/**
 * Force refresh MCP change detection (useful for webhooks)
 */
export const refreshMcpChangeDetection = async (): Promise<void> => {
  try {
    const currentInfo = await getMcpChangeInfo();
    lastKnownMcpState = currentInfo;
    logger.info('Refreshed MCP change detection');
  } catch (error) {
    logger.error('Failed to refresh MCP change detection:', error as Error);
  }
};

/**
 * Clear MCP change detection cache (useful for testing)
 */
export const clearMcpChangeDetectionCache = (): void => {
  lastKnownMcpState = null;
  logger.info('Cleared MCP change detection cache');
};

/**
 * Get MCP change detection statistics
 */
export const getMcpChangeDetectionStats = () => ({
  hasCache: lastKnownMcpState !== null,
  lastKnownState: lastKnownMcpState
    ? {
        mcpServersHash: lastKnownMcpState.mcpServersHash,
        lastUpdated: lastKnownMcpState.lastUpdated,
      }
    : null,
});
