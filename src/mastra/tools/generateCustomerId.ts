import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const generateCustomerId = createTool({
  id: 'generateCustomerId',
  description: '新規顧客用のユニークな顧客IDを生成します',
  inputSchema: z.object({}),
  outputSchema: z.object({
    customerId: z.string(),
    generatedAt: z.string(),
  }),
  execute: async () => {
    // Generate unique customer ID with timestamp and random component
    const timestamp = Date.now().toString();
    const randomSuffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const customerId = `CU${timestamp.slice(-8)}${randomSuffix}`;

    return {
      customerId,
      generatedAt: new Date().toISOString(),
    };
  },
});
