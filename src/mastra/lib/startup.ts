import { mcpManager } from '../services/mcp-config';
import { logger } from './logger';

/**
 * Initialize all services that need to be started at app launch
 */
export async function initializeServices(): Promise<void> {
  logger.info('Starting service initialization...');

  try {
    // Initialize MCP manager (loads all MCP servers and warms cache)
    await mcpManager.initialize();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error as Error);
    throw error;
  }
}

/**
 * Get status of all initialized services
 */
export function getServiceStatus(): Record<string, unknown> {
  return {
    mcpManager: mcpManager.getCacheStats(),
    timestamp: new Date().toISOString(),
  };
}
