import { agentManager } from '../services/agent-manager';
import { mcpClientManager } from '../services/mcp-client-manager';
import { modelManager } from '../services/model-manager';
import { toolManager } from '../services/tool-manager';
import { logger } from './logger';

// ============================================================================
// Service Initialization
// ============================================================================

/**
 * Initialize all services in the correct order at application startup
 */
export async function initializeServices(): Promise<void> {
  logger.info('Starting service initialization...');

  try {
    await modelManager.initialize();
    await toolManager.initialize();
    await mcpClientManager.initialize();
    await agentManager.initialize();

    logger.info('All services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error as Error);
    throw error;
  }
}
