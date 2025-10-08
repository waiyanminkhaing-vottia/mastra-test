import { anthropic } from '@ai-sdk/anthropic';
import { azure } from '@ai-sdk/azure';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { MastraLanguageModel } from '@mastra/core';
import { Provider } from '@prisma/client';
import { ollama } from 'ollama-ai-provider-v2';

import { CacheManager, createHash } from '../lib/cache';
import { prisma } from '../lib/prisma';
import { getEnvInt } from '../lib/utils';

// ============================================================================
// Model Provider Factory
// ============================================================================

function createModelInstance(
  provider: Provider,
  modelName: string
): MastraLanguageModel {
  switch (provider) {
    case Provider.OPENAI:
      return openai(modelName);
    case Provider.ANTHROPIC:
      return anthropic(modelName);
    case Provider.GOOGLE:
      return google(modelName);
    case Provider.OLLAMA:
      return ollama(modelName);
    case Provider.AZURE_OPENAI:
      return azure(modelName);
    default:
      return openai('gpt-4o');
  }
}

// ============================================================================
// Model Manager - Manages AI model instances
// ============================================================================

const modelManager = new CacheManager<MastraLanguageModel>({
  name: 'ModelManager',
  ttlSeconds: getEnvInt('MODEL_CACHE_TTL', 3600),
  checkPeriodSeconds: getEnvInt('MODEL_CACHE_CHECK_PERIOD', 600),

  loadData: async () => {
    const modelsData = await prisma.model.findMany();
    const models = new Map<string, MastraLanguageModel>();

    for (const modelData of modelsData) {
      const model = createModelInstance(modelData.provider, modelData.name);
      models.set(modelData.id, model);
    }

    return models;
  },

  getChangeHash: async () => {
    const modelsData = await prisma.model.findMany({
      orderBy: { id: 'asc' },
    });

    const modelsString = modelsData
      .map(
        (model) =>
          `${model.id}:${model.name}:${model.provider}:${model.updatedAt.getTime()}`
      )
      .join('||');

    return createHash(modelsString);
  },
});

// ============================================================================
// Exports
// ============================================================================

export { modelManager };
