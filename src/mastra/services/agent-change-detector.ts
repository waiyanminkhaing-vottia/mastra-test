import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';

interface AgentChangeInfo {
  agentId: string;
  agentName: string;
  lastUpdated: Date;
  modelUpdated: Date;
  promptUpdated: Date;
}

// In-memory store for last known update times
const lastKnownUpdates = new Map<string, AgentChangeInfo>();

/**
 * Check if agent configuration has changed since last check
 * @param agentName - Name of the agent to check
 * @returns Promise<boolean> - True if config has changed
 */
export const hasAgentConfigChanged = async (
  agentName: string
): Promise<boolean> => {
  try {
    // Get current timestamps from database
    const currentInfo = await getAgentChangeInfo(agentName);

    if (!currentInfo) {
      logger.warn(`Agent '${agentName}' not found in database`);
      return false;
    }

    const lastKnown = lastKnownUpdates.get(agentName);

    // If no previous record, consider it changed (first time)
    if (!lastKnown) {
      lastKnownUpdates.set(agentName, currentInfo);
      logger.info(
        `First time checking agent '${agentName}', treating as changed`
      );
      return true;
    }

    // Check if any timestamps have changed
    const hasChanged =
      currentInfo.lastUpdated.getTime() !== lastKnown.lastUpdated.getTime() ||
      currentInfo.modelUpdated.getTime() !== lastKnown.modelUpdated.getTime() ||
      currentInfo.promptUpdated.getTime() !== lastKnown.promptUpdated.getTime();

    if (hasChanged) {
      logger.info(`Agent config changed for '${agentName}':`, {
        agentUpdated: currentInfo.lastUpdated !== lastKnown.lastUpdated,
        modelUpdated: currentInfo.modelUpdated !== lastKnown.modelUpdated,
        promptUpdated: currentInfo.promptUpdated !== lastKnown.promptUpdated,
        currentTimestamps: {
          agent: currentInfo.lastUpdated,
          model: currentInfo.modelUpdated,
          prompt: currentInfo.promptUpdated,
        },
        previousTimestamps: {
          agent: lastKnown.lastUpdated,
          model: lastKnown.modelUpdated,
          prompt: lastKnown.promptUpdated,
        },
      });

      // Update our cache with new timestamps
      lastKnownUpdates.set(agentName, currentInfo);
    } else {
      logger.debug(`No changes detected for agent '${agentName}'`);
    }

    return hasChanged;
  } catch (error) {
    logger.error(
      `Failed to check agent config changes for '${agentName}':`,
      error as Error
    );
    return false; // Assume no change on error to avoid unnecessary fetches
  }
};

/**
 * Get current change information for an agent
 */
const getAgentChangeInfo = async (
  agentName: string
): Promise<AgentChangeInfo | null> => {
  const agent = await prisma.agent.findUnique({
    where: { name: agentName },
    include: {
      model: true,
      prompt: true,
    },
  });

  if (!agent) {
    return null;
  }

  return {
    agentId: agent.id,
    agentName: agent.name,
    lastUpdated: agent.updatedAt,
    modelUpdated: agent.model.updatedAt,
    promptUpdated: agent.prompt.updatedAt,
  };
};

/**
 * Force refresh change detection for an agent (useful for webhooks)
 * @param agentName - Name of the agent to refresh
 */
export const refreshAgentChangeDetection = async (
  agentName: string
): Promise<void> => {
  try {
    const currentInfo = await getAgentChangeInfo(agentName);
    if (currentInfo) {
      lastKnownUpdates.set(agentName, currentInfo);
      logger.info(`Refreshed change detection for agent '${agentName}'`);
    }
  } catch (error) {
    logger.error(
      `Failed to refresh change detection for '${agentName}':`,
      error as Error
    );
  }
};

/**
 * Clear change detection cache (useful for testing)
 */
export const clearChangeDetectionCache = (): void => {
  lastKnownUpdates.clear();
  logger.info('Cleared all change detection cache');
};

/**
 * Get change detection statistics
 */
export const getChangeDetectionStats = () => ({
  trackedAgents: Array.from(lastKnownUpdates.keys()),
  totalTracked: lastKnownUpdates.size,
  lastKnownUpdates: Object.fromEntries(
    Array.from(lastKnownUpdates.entries()).map(([key, value]) => [
      key,
      {
        lastUpdated: value.lastUpdated,
        modelUpdated: value.modelUpdated,
        promptUpdated: value.promptUpdated,
      },
    ])
  ),
});
