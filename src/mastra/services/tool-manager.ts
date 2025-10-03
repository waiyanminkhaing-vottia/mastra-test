import type { ToolAction } from '@mastra/core';

import { CacheManager, createHash } from '../lib/cache';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { getEnvInt } from '../lib/utils';
import { toolsMap } from '../tools';

// ============================================================================
// Tool Manager - Manages custom tool instances
// ============================================================================

const toolManager = new CacheManager<ToolAction>({
  name: 'ToolManager',
  ttlSeconds: getEnvInt('TOOL_CACHE_TTL', 3600),
  checkPeriodSeconds: getEnvInt('TOOL_CACHE_CHECK_PERIOD', 600),

  loadData: async () => {
    const toolsData = await prisma.tool.findMany();
    const tools = new Map<string, ToolAction>();

    for (const toolData of toolsData) {
      const toolName = toolData.name;
      const tool = toolsMap[toolName as keyof typeof toolsMap];

      if (tool) {
        tools.set(toolData.id, tool as unknown as ToolAction);
        logger.debug(`Loaded tool: '${toolName}'`);
      } else {
        logger.warn(`Tool '${toolName}' not found in tools map`);
      }
    }

    return tools;
  },

  getChangeHash: async () => {
    const toolsData = await prisma.tool.findMany({
      orderBy: { id: 'asc' },
    });

    const toolsString = toolsData
      .map((tool) => `${tool.id}:${tool.name}:${tool.updatedAt.getTime()}`)
      .join('||');

    return createHash(toolsString);
  },
});

// ============================================================================
// Exports
// ============================================================================

export { toolManager };
