import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const generateReservationId = createTool({
  id: 'generateReservationId',
  description: '修理予約用のユニークな予約IDを生成します',
  inputSchema: z.object({}),
  outputSchema: z.object({
    reservationId: z.string(),
    generatedAt: z.string(),
  }),
  execute: async () => {
    // Generate unique reservation ID with timestamp and random component
    const timestamp = Date.now().toString();
    const randomSuffix = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0');
    const reservationId = `RV${timestamp.slice(-8)}${randomSuffix}`;

    return {
      reservationId,
      generatedAt: new Date().toISOString(),
    };
  },
});
