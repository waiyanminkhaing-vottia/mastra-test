import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { MastraLanguageModel } from '@mastra/core';
import { Provider } from '@prisma/client';
import { ollama } from 'ollama-ai-provider-v2';

import { logError } from '../lib/logger';
import { prisma } from '../lib/prisma';

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
      return openai('gpt-4o'); // fallback
  }
};

export interface AgentConfig {
  id: string;
  name: string;
  description: string | null;
  model: MastraLanguageModel;
  instruction: string;
}

export const getAgentConfig = async (
  agentName: string
): Promise<AgentConfig> => {
  try {
    const agent = await prisma.agent.findUniqueOrThrow({
      where: { name: agentName },
      include: {
        model: true,
        prompt: true,
        label: true,
      },
    });

    let labelId = agent.labelId;

    // If agent has no labelId, check DEMO environment variable
    if (!agent.labelId && process.env.DEMO && process.env.DEMO !== 'default') {
      const label = await prisma.promptLabel.findUnique({
        where: { name: process.env.DEMO },
      });
      labelId = label?.id ?? null;
    }

    let prompt;
    if (labelId) {
      prompt = await prisma.promptVersion.findUniqueOrThrow({
        where: {
          promptId_labelId: {
            promptId: agent.promptId,
            labelId,
          },
        },
      });
    } else {
      prompt = await prisma.promptVersion.findFirst({
        where: { promptId: agent.promptId },
        orderBy: {
          version: 'desc',
        },
      });
    }

    if (!prompt) {
      throw new Error(`No prompt version found for agent ${agentName}`);
    }

    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      model: createModelInstance(agent.model.provider, agent.model.name),
      instruction: prompt.content,
    };
  } catch (error) {
    logError(
      `Failed to get agent config for ${agentName}`,
      error instanceof Error ? error : new Error(String(error))
    );
    throw error;
  }
};
