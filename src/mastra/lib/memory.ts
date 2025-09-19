import { openai } from '@ai-sdk/openai';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';

const databaseUrl = process.env.AGENT_DATABASE_URL;
if (!databaseUrl) {
  throw new Error('AGENT_DATABASE_URL environment variable is required');
}

// Create shared storage and vector instances to avoid duplicates
const sharedStorage = new PostgresStore({
  connectionString: databaseUrl,
});

const sharedVector = new PgVector({
  connectionString: databaseUrl,
});

// Create a shared Memory instance that all agents can use
export const sharedMemory = new Memory({
  storage: sharedStorage,
  vector: sharedVector,
  embedder: openai.embedding('text-embedding-3-small'),
  options: {
    // Number of recent messages to include in context
    lastMessages: 10,

    // Working memory for persistent user information
    workingMemory: {
      enabled: true,
      scope: 'resource',
    },
  },
});

// Export the shared storage for reuse in the main Mastra instance
export { sharedStorage, sharedVector };
