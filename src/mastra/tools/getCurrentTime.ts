import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const getCurrentTime = createTool({
  id: 'getCurrentTime',
  description: '現在の日本標準時（JST）の日付と時刻を取得します',
  inputSchema: z.object({}),
  outputSchema: z.object({
    currentTime: z.string(),
    timezone: z.string(),
    timestamp: z.number(),
  }),
  execute: async (_params) => {
    const now = new Date();

    // Format time for Japan timezone (Asia/Tokyo)
    const japanTime = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).format(now);

    return {
      currentTime: japanTime,
      timezone: 'Asia/Tokyo (JST)',
      timestamp: now.getTime(),
    };
  },
});
