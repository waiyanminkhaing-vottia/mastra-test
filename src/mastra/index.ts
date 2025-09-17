import { Mastra } from '@mastra/core/mastra';
import { type LogLevel, PinoLogger } from '@mastra/loggers';

export const mastra = new Mastra({
  logger: new PinoLogger({
    name: 'Mastra',
    level: (process.env.LOG_LEVEL as LogLevel) ?? 'info',
  }),
});
